import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { cookieAuth, requireUser } from "../auth/session.js";
import type { Database } from "../db/database.js";
import { ErrorResponseSchema } from "../http/errors.js";
import { CompanySchema, CompanyUpdateSchema } from "../http/schemas.js";
import { getCompany, updateCompany } from "../repositories/companies.js";

export const companyRoutes: FastifyPluginAsyncZod<{ db: Database }> = async (app, { db }) => {
  app.addHook("onRequest", async (request) => void requireUser(request));

  app.get(
    "",
    {
      schema: {
        tags: ["Entreprise"],
        summary: "Profil entreprise de l'artisan (mentions légales des devis)",
        security: cookieAuth,
        response: { 200: CompanySchema, 401: ErrorResponseSchema },
      },
    },
    async (request) => getCompany(db, requireUser(request).id),
  );

  app.patch(
    "",
    {
      schema: {
        tags: ["Entreprise"],
        summary: "Modifier le profil entreprise (champs partiels)",
        security: cookieAuth,
        body: CompanyUpdateSchema,
        response: { 200: CompanySchema, 400: ErrorResponseSchema, 401: ErrorResponseSchema },
      },
    },
    async (request) => updateCompany(db, requireUser(request).id, request.body),
  );
};
