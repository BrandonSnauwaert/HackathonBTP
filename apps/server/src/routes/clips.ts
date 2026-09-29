import { createReadStream } from "node:fs";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { cookieAuth, requireUser } from "../auth/session.js";
import { ErrorResponseSchema, HttpError } from "../http/errors.js";
import { ClipSchema, IdParams } from "../http/schemas.js";
import type { ClipService } from "../services/clip-service.js";

const tags = ["Dictées"];
const security = cookieAuth;
const ClipParams = z.object({ id: z.uuid(), clipId: z.uuid() });
const errors = { 400: ErrorResponseSchema, 401: ErrorResponseSchema, 404: ErrorResponseSchema, 409: ErrorResponseSchema };

/** Attente maximale quand le client demande `wait=true`. */
const WAIT_TIMEOUT_MS = 120_000;
const AUDIO_CONTENT_TYPES = ["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave", "application/octet-stream"];

export const clipRoutes: FastifyPluginAsyncZod<{ clips: ClipService; maxUploadBytes: number }> = async (
  app,
  { clips, maxUploadBytes },
) => {
  app.addHook("onRequest", async (request) => void requireUser(request));
  app.addContentTypeParser(AUDIO_CONTENT_TYPES, { parseAs: "buffer", bodyLimit: maxUploadBytes }, (_request, body, done) =>
    done(null, body),
  );

  app.post(
    "/:id/clips",
    {
      schema: {
        tags,
        security,
        summary: "Envoyer une dictée audio (talkie-walkie)",
        description:
          "Corps : le fichier **WAV** brut (PCM 16 bits ou flottant 32 bits, toute fréquence), avec " +
          "`Content-Type: audio/wav`. La dictée est transcrite puis analysée en tâche de fond : les lignes " +
          "extraites s'ajoutent au devis. Suivre l'avancement via `GET /api/quotes/{id}` (champ `clips`) " +
          "ou passer `wait=true` pour attendre le résultat.\n\n" +
          "Hors connexion : générer un `clientClipId` (UUID) sur le téléphone. Un renvoi du même clip " +
          "renvoie le clip existant (200) au lieu d'en créer un second.",
        params: IdParams,
        querystring: z.object({
          clientClipId: z.uuid().optional().describe("Identifiant du clip généré par le téléphone"),
          recordedAt: z.iso.datetime({ offset: true }).optional().describe("Date de l'enregistrement (ISO 8601)"),
          wait: z.enum(["true", "false"]).optional().describe("true = attendre la fin du traitement (2 min max)"),
        }),
        response: {
          200: ClipSchema.describe("Clip déjà reçu, ou traitement terminé (wait=true)"),
          202: ClipSchema.describe("Clip reçu, traitement en cours"),
          ...errors,
        },
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        throw new HttpError(400, "invalid_audio", "Corps attendu : un fichier WAV (Content-Type: audio/wav)");
      }
      const { id } = request.params;
      const { clientClipId, recordedAt, wait } = request.query;
      const { clip, created } = await clips.upload(user.id, id, request.body, { clientClipId, recordedAt });

      if (wait === "true") {
        await clips.waitFor(clip.id, WAIT_TIMEOUT_MS);
        const current = clips.get(user.id, id, clip.id);
        return reply.code(current.status === "done" || current.status === "failed" ? 200 : 202).send(current);
      }
      return reply.code(created ? 202 : 200).send(clip);
    },
  );

  app.get(
    "/:id/clips",
    {
      schema: {
        tags,
        security,
        summary: "Lister les dictées d'un devis",
        params: IdParams,
        response: { 200: z.array(ClipSchema), ...errors },
      },
    },
    async (request) => clips.list(requireUser(request).id, request.params.id),
  );

  app.get(
    "/:id/clips/:clipId",
    {
      schema: {
        tags,
        security,
        summary: "Détail d'une dictée : statut, transcription, points manquants",
        params: ClipParams,
        response: { 200: ClipSchema, ...errors },
      },
    },
    async (request) => clips.get(requireUser(request).id, request.params.id, request.params.clipId),
  );

  app.get(
    "/:id/clips/:clipId/audio",
    {
      schema: {
        tags,
        security,
        summary: "Réécouter une dictée (WAV mono 24 kHz)",
        params: ClipParams,
      },
    },
    async (request, reply) => {
      const path = clips.audioPath(requireUser(request).id, request.params.id, request.params.clipId);
      return reply.type("audio/wav").send(createReadStream(path));
    },
  );

  app.post(
    "/:id/clips/:clipId/retry",
    {
      schema: {
        tags,
        security,
        summary: "Relancer le traitement d'une dictée en échec",
        description: "Si la transcription avait réussi, seule l'analyse par le LLM est refaite.",
        params: ClipParams,
        response: { 202: ClipSchema, ...errors },
      },
    },
    async (request, reply) =>
      reply.code(202).send(clips.retry(requireUser(request).id, request.params.id, request.params.clipId)),
  );
};
