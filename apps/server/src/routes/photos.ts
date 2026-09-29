import { createReadStream } from "node:fs";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { cookieAuth, requireUser } from "../auth/session.js";
import { ErrorResponseSchema, HttpError } from "../http/errors.js";
import { IdParams, PhotoSchema, PhotoUpdateSchema } from "../http/schemas.js";
import type { PhotoService } from "../services/photo-service.js";

const tags = ["Photos"];
const security = cookieAuth;
const PhotoParams = z.object({ id: z.uuid(), photoId: z.uuid() });
const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
};
const IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/octet-stream"];

export const photoRoutes: FastifyPluginAsyncZod<{ photos: PhotoService; maxPhotoBytes: number }> = async (
  app,
  { photos, maxPhotoBytes },
) => {
  app.addHook("onRequest", async (request) => void requireUser(request));
  // Limite un peu au-dessus du maximum autorisé, pour renvoyer une erreur claire (photo_too_large).
  app.addContentTypeParser(
    IMAGE_CONTENT_TYPES,
    { parseAs: "buffer", bodyLimit: maxPhotoBytes + 1024 * 1024 },
    (_request, body, done) => done(null, body),
  );

  app.post(
    "/:id/photos",
    {
      schema: {
        tags,
        security,
        summary: "Ajouter une photo de chantier",
        description:
          "Corps : l'image brute (JPEG, PNG ou WebP) avec son `Content-Type`. Le type est vérifié sur le contenu " +
          "du fichier. Réduire la photo sur le téléphone avant l'envoi (ex. 1600 px de large).\n\n" +
          "Hors connexion : générer un `clientPhotoId` (UUID) sur le téléphone. Un renvoi de la même photo " +
          "renvoie la photo existante (200) au lieu d'en créer une seconde.",
        params: IdParams,
        querystring: z.object({
          clientPhotoId: z.uuid().optional().describe("Identifiant de la photo généré par le téléphone"),
          takenAt: z.iso.datetime({ offset: true }).optional().describe("Date de la prise de vue (ISO 8601)"),
          caption: z.string().max(500).optional().describe("Légende"),
        }),
        response: {
          200: PhotoSchema.describe("Photo déjà reçue"),
          201: PhotoSchema.describe("Photo ajoutée"),
          ...errors,
        },
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        throw new HttpError(400, "invalid_image", "Corps attendu : une image (Content-Type: image/jpeg...)");
      }
      const { photo, created } = await photos.upload(user.id, request.params.id, request.body, request.query);
      return reply.code(created ? 201 : 200).send(photo);
    },
  );

  app.get(
    "/:id/photos",
    {
      schema: {
        tags,
        security,
        summary: "Lister les photos d'un devis",
        params: IdParams,
        response: { 200: z.array(PhotoSchema), ...errors },
      },
    },
    async (request) => photos.list(requireUser(request).id, request.params.id),
  );

  app.get(
    "/:id/photos/:photoId/file",
    { schema: { tags, security, summary: "Fichier image d'une photo", params: PhotoParams } },
    async (request, reply) => {
      const { path, mimeType } = photos.file(requireUser(request).id, request.params.id, request.params.photoId);
      // Le fichier d'une photo ne change jamais : le navigateur peut le garder en cache.
      return reply
        .type(mimeType)
        .header("cache-control", "private, max-age=31536000, immutable")
        .send(createReadStream(path));
    },
  );

  app.patch(
    "/:id/photos/:photoId",
    {
      schema: {
        tags,
        security,
        summary: "Modifier la légende ou la visibilité pour le client",
        params: PhotoParams,
        body: PhotoUpdateSchema,
        response: { 200: PhotoSchema, ...errors },
      },
    },
    async (request) => photos.update(requireUser(request).id, request.params.id, request.params.photoId, request.body),
  );

  app.delete(
    "/:id/photos/:photoId",
    {
      schema: {
        tags,
        security,
        summary: "Supprimer une photo",
        params: PhotoParams,
        response: { 204: z.null().describe("Supprimée"), ...errors },
      },
    },
    async (request, reply) => {
      await photos.remove(requireUser(request).id, request.params.id, request.params.photoId);
      return reply.code(204).send(null);
    },
  );
};
