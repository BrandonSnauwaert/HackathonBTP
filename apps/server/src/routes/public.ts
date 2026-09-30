import { createReadStream } from "node:fs";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { ErrorResponseSchema, HttpError } from "../http/errors.js";
import { detectImageType } from "../images/image-type.js";
import { AcceptQuoteSchema, DeclineQuoteSchema, QuoteDocumentSchema } from "../http/schemas.js";
import type { QuoteService } from "../services/quote-service.js";

const tags = ["Page client"];
const TokenParams = z.object({
  token: z
    .string()
    .regex(/^[A-Za-z0-9_-]{20,64}$/)
    .describe("Secret du lien public du devis"),
});
const errors = { 400: ErrorResponseSchema, 404: ErrorResponseSchema, 409: ErrorResponseSchema };

/** GIF transparent de 1 × 1 pixel. */
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/**
 * Routes publiques du devis, sans connexion : l'accès se fait par le secret du lien envoyé au client.
 * Un devis non envoyé (brouillon, prêt) n'y est jamais accessible.
 */
export const publicRoutes: FastifyPluginAsyncZod<{ quotes: QuoteService }> = async (app, { quotes }) => {
  app.get(
    "/:token",
    {
      schema: {
        tags,
        summary: "Ouvrir le devis (page client)",
        description: "La première ouverture fait passer le devis de « envoyé » à « consulté ».",
        params: TokenParams,
        response: { 200: QuoteDocumentSchema, ...errors },
      },
    },
    async (request) => quotes.openPublic(request.params.token),
  );

  app.post(
    "/:token/accept",
    {
      schema: {
        tags,
        summary: "Accepter le devis (bon pour accord)",
        params: TokenParams,
        body: AcceptQuoteSchema,
        response: { 200: QuoteDocumentSchema, ...errors },
      },
    },
    async (request) => {
      const { signature } = request.body;
      // Le format est vérifié par le schéma ; le contenu doit être une vraie image PNG.
      if (signature && detectImageType(Buffer.from(signature.split(",")[1] ?? "", "base64")) !== "image/png") {
        throw new HttpError(400, "invalid_signature", "La signature n'est pas une image valide");
      }
      return quotes.respond(request.params.token, "accepted", request.body);
    },
  );

  app.get(
    "/:token/logo",
    {
      schema: { tags, summary: "Logo de l'entreprise (en-tête du devis)", params: TokenParams },
    },
    async (request, reply) => {
      const { path, mimeType } = quotes.publicLogoFile(request.params.token);
      return reply.type(mimeType).header("cache-control", "public, max-age=86400").send(createReadStream(path));
    },
  );

  app.post(
    "/:token/decline",
    {
      schema: {
        tags,
        summary: "Refuser le devis",
        params: TokenParams,
        body: DeclineQuoteSchema,
        response: { 200: QuoteDocumentSchema, ...errors },
      },
    },
    async (request) =>
      quotes.respond(request.params.token, "declined", {
        name: request.body.name ?? "",
        message: request.body.message,
      }),
  );

  app.get(
    "/:token/photos/:photoId",
    {
      schema: {
        tags,
        summary: "Photo partagée avec le client",
        params: TokenParams.extend({ photoId: z.uuid() }),
      },
    },
    async (request, reply) => {
      const { path, mimeType } = quotes.publicPhotoFile(request.params.token, request.params.photoId);
      return reply.type(mimeType).header("cache-control", "private, max-age=86400").send(createReadStream(path));
    },
  );

  app.get(
    "/:token/pixel.gif",
    {
      schema: {
        tags,
        summary: "Pixel de suivi de l'e-mail",
        description:
          "Image invisible insérée dans l'e-mail : note « e-mail ouvert » dans l'historique, à titre indicatif " +
          "(Apple Mail précharge les images). Répond toujours l'image, même pour un lien inconnu.",
        params: z.object({ token: z.string() }),
      },
    },
    async (request, reply) => {
      quotes.recordEmailOpen(request.params.token);
      return reply
        .type("image/gif")
        .header("cache-control", "no-store, no-cache, must-revalidate, max-age=0")
        .send(PIXEL);
    },
  );
};
