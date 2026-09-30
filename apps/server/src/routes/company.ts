import { createReadStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { cookieAuth, requireUser } from "../auth/session.js";
import type { Database } from "../db/database.js";
import { ErrorResponseSchema, HttpError } from "../http/errors.js";
import { CompanySchema, CompanyUpdateSchema } from "../http/schemas.js";
import { IMAGE_EXTENSIONS, IMAGE_TYPES, detectImageType } from "../images/image-type.js";
import { getCompany, updateCompany, type Company } from "../repositories/companies.js";
import { logoUrlOf } from "../services/quote-service.js";

/** Un logo est une petite image : le front le réduit à 512 px avant l'envoi. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Profil tel qu'exposé par l'API : l'adresse du logo plutôt que son fichier. */
function companyView(company: Company) {
  const { logoFile: _logoFile, logoMime: _logoMime, ...rest } = company;
  return { ...rest, logoUrl: logoUrlOf(company, "/api/company/logo") };
}

export const companyRoutes: FastifyPluginAsyncZod<{ db: Database; logosDir: string }> = async (
  app,
  { db, logosDir },
) => {
  app.addHook("onRequest", async (request) => void requireUser(request));
  app.addContentTypeParser(
    [...IMAGE_TYPES, "application/octet-stream"],
    { parseAs: "buffer", bodyLimit: MAX_LOGO_BYTES },
    (_request, body, done) => done(null, body),
  );

  const tags = ["Entreprise"];
  const errors = { 400: ErrorResponseSchema, 401: ErrorResponseSchema, 404: ErrorResponseSchema };

  app.get(
    "",
    {
      schema: {
        tags,
        summary: "Profil entreprise de l'artisan (mentions légales des devis)",
        security: cookieAuth,
        response: { 200: CompanySchema, 401: ErrorResponseSchema },
      },
    },
    async (request) => companyView(getCompany(db, requireUser(request).id)),
  );

  app.patch(
    "",
    {
      schema: {
        tags,
        summary: "Modifier le profil entreprise (champs partiels)",
        security: cookieAuth,
        body: CompanyUpdateSchema,
        response: { 200: CompanySchema, 400: ErrorResponseSchema, 401: ErrorResponseSchema },
      },
    },
    async (request) => companyView(updateCompany(db, requireUser(request).id, request.body)),
  );

  app.put(
    "/logo",
    {
      schema: {
        tags,
        summary: "Remplacer le logo (imprimé sur les devis)",
        description:
          "Corps : l'image brute (JPEG, PNG ou WebP, 2 Mo au plus) avec son `Content-Type`. " +
          "Le type est vérifié sur le contenu du fichier.",
        security: cookieAuth,
        response: { 200: CompanySchema, ...errors },
      },
    },
    async (request) => {
      const userId = requireUser(request).id;
      const body = request.body;
      const type = Buffer.isBuffer(body) ? detectImageType(body) : null;
      if (!Buffer.isBuffer(body) || !type) {
        throw new HttpError(400, "invalid_image", "Logo attendu : une image JPEG, PNG ou WebP");
      }
      const previous = getCompany(db, userId).logoFile;
      const file = `logo-${userId}-${Date.now()}.${IMAGE_EXTENSIONS[type]}`;
      await mkdir(logosDir, { recursive: true });
      await writeFile(join(logosDir, file), body);
      const company = updateCompany(db, userId, { logoFile: file, logoMime: type });
      if (previous) await rm(join(logosDir, previous), { force: true });
      return companyView(company);
    },
  );

  app.delete(
    "/logo",
    {
      schema: {
        tags,
        summary: "Supprimer le logo (retour au logo par défaut, aux initiales)",
        security: cookieAuth,
        response: { 200: CompanySchema, 401: ErrorResponseSchema },
      },
    },
    async (request) => {
      const userId = requireUser(request).id;
      const previous = getCompany(db, userId).logoFile;
      const company = updateCompany(db, userId, { logoFile: null, logoMime: null });
      if (previous) await rm(join(logosDir, previous), { force: true });
      return companyView(company);
    },
  );

  app.get(
    "/logo",
    {
      schema: { tags, summary: "Logo de l'entreprise (image)", security: cookieAuth },
    },
    async (request, reply) => {
      const company = getCompany(db, requireUser(request).id);
      if (!company.logoFile || !company.logoMime) throw new HttpError(404, "not_found", "Pas de logo");
      return reply
        .type(company.logoMime)
        .header("cache-control", "private, max-age=86400")
        .send(createReadStream(join(logosDir, company.logoFile)));
    },
  );
};
