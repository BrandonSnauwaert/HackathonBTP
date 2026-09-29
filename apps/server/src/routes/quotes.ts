import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { cookieAuth, requireUser } from "../auth/session.js";
import { ErrorResponseSchema } from "../http/errors.js";
import {
  IdParams,
  LineInputSchema,
  LineOrderSchema,
  LineParams,
  LineUpdateSchema,
  QuoteCreateSchema,
  QuoteDetailSchema,
  QuoteStatusSchema,
  QuoteSummarySchema,
  QuoteUpdateSchema,
  StatusChangeSchema,
} from "../http/schemas.js";
import type { QuoteService } from "../services/quote-service.js";

const security = cookieAuth;
const quoteTags = ["Devis"];
const lineTags = ["Lignes de devis"];

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
};

export const quoteRoutes: FastifyPluginAsyncZod<{ quotes: QuoteService }> = async (app, { quotes }) => {
  app.addHook("onRequest", async (request) => void requireUser(request));

  app.get(
    "",
    {
      schema: {
        tags: quoteTags,
        security,
        summary: "Lister ses devis (du plus récent au plus ancien)",
        querystring: z.object({ status: QuoteStatusSchema.optional().describe("Filtrer par statut") }),
        response: { 200: z.array(QuoteSummarySchema), 401: ErrorResponseSchema },
      },
    },
    async (request) => quotes.list(requireUser(request).id, request.query.status),
  );

  app.post(
    "",
    {
      schema: {
        tags: quoteTags,
        security,
        summary: "Créer un devis (brouillon), pour un client existant ou nouveau",
        description:
          "Le numéro (D-AAAA-NNNN), la durée de validité et les conditions de paiement par défaut " +
          "viennent du profil entreprise s'ils ne sont pas fournis.",
        body: QuoteCreateSchema,
        response: { 201: QuoteDetailSchema, ...errors },
      },
    },
    async (request, reply) => reply.code(201).send(quotes.create(requireUser(request).id, request.body)),
  );

  app.get(
    "/:id",
    {
      schema: {
        tags: quoteTags,
        security,
        summary: "Détail d'un devis : client, lignes, totaux, points manquants, historique",
        params: IdParams,
        response: { 200: QuoteDetailSchema, ...errors },
      },
    },
    async (request) => quotes.get(requireUser(request).id, request.params.id),
  );

  app.patch(
    "/:id",
    {
      schema: {
        tags: quoteTags,
        security,
        summary: "Modifier les infos du devis (brouillon ou prêt uniquement)",
        description: "Un devis « prêt » modifié repasse en brouillon.",
        params: IdParams,
        body: QuoteUpdateSchema,
        response: { 200: QuoteDetailSchema, ...errors },
      },
    },
    async (request) => quotes.update(requireUser(request).id, request.params.id, request.body),
  );

  app.delete(
    "/:id",
    {
      schema: {
        tags: quoteTags,
        security,
        summary: "Supprimer un devis (brouillon ou prêt uniquement)",
        params: IdParams,
        response: { 204: z.null().describe("Supprimé"), ...errors },
      },
    },
    async (request, reply) => {
      quotes.remove(requireUser(request).id, request.params.id);
      return reply.code(204).send(null);
    },
  );

  app.post(
    "/:id/status",
    {
      schema: {
        tags: quoteTags,
        security,
        summary: "Changer le statut à la main (draft, ready, accepted, declined)",
        description:
          "Passer en `ready` exige un devis complet : sinon 409 `quote_incomplete` avec la liste dans `details.issues`. " +
          "Les autres statuts (envoyé, consulté, à relancer, expiré) sont posés automatiquement.",
        params: IdParams,
        body: StatusChangeSchema,
        response: { 200: QuoteDetailSchema, ...errors },
      },
    },
    async (request) => quotes.changeStatus(requireUser(request).id, request.params.id, request.body.status),
  );

  app.post(
    "/:id/lines",
    {
      schema: {
        tags: lineTags,
        security,
        summary: "Ajouter une ligne en fin de devis",
        params: IdParams,
        body: LineInputSchema,
        response: { 201: QuoteDetailSchema, ...errors },
      },
    },
    async (request, reply) =>
      reply.code(201).send(quotes.addLine(requireUser(request).id, request.params.id, request.body)),
  );

  app.patch(
    "/:id/lines/:lineId",
    {
      schema: {
        tags: lineTags,
        security,
        summary: "Modifier une ligne (champs partiels)",
        params: LineParams,
        body: LineUpdateSchema,
        response: { 200: QuoteDetailSchema, ...errors },
      },
    },
    async (request) =>
      quotes.updateLine(requireUser(request).id, request.params.id, request.params.lineId, request.body),
  );

  app.delete(
    "/:id/lines/:lineId",
    {
      schema: {
        tags: lineTags,
        security,
        summary: "Supprimer une ligne",
        params: LineParams,
        response: { 200: QuoteDetailSchema, ...errors },
      },
    },
    async (request) => quotes.removeLine(requireUser(request).id, request.params.id, request.params.lineId),
  );

  app.put(
    "/:id/lines/order",
    {
      schema: {
        tags: lineTags,
        security,
        summary: "Réordonner les lignes",
        params: IdParams,
        body: LineOrderSchema,
        response: { 200: QuoteDetailSchema, ...errors },
      },
    },
    async (request) => quotes.reorderLines(requireUser(request).id, request.params.id, request.body.lineIds),
  );
};
