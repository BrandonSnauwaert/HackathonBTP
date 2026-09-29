import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { cookieAuth, requireUser } from "../auth/session.js";
import type { Database } from "../db/database.js";
import { ErrorResponseSchema } from "../http/errors.js";
import { ClientInputSchema, ClientSchema, ClientUpdateSchema, IdParams } from "../http/schemas.js";
import { createClient, deleteClient, getClient, listClients, updateClient } from "../repositories/clients.js";

const tags = ["Clients"];
const security = cookieAuth;

export const clientRoutes: FastifyPluginAsyncZod<{ db: Database }> = async (app, { db }) => {
  app.addHook("onRequest", async (request) => void requireUser(request));

  app.get(
    "",
    {
      schema: {
        tags,
        security,
        summary: "Lister ses clients",
        querystring: z.object({ search: z.string().optional().describe("Filtre sur le nom ou l'e-mail") }),
        response: { 200: z.array(ClientSchema), 401: ErrorResponseSchema },
      },
    },
    async (request) => listClients(db, requireUser(request).id, request.query.search),
  );

  app.post(
    "",
    {
      schema: {
        tags,
        security,
        summary: "Créer un client",
        body: ClientInputSchema,
        response: { 201: ClientSchema, 400: ErrorResponseSchema, 401: ErrorResponseSchema },
      },
    },
    async (request, reply) => reply.code(201).send(createClient(db, requireUser(request).id, request.body)),
  );

  app.get(
    "/:id",
    {
      schema: {
        tags,
        security,
        summary: "Détail d'un client",
        params: IdParams,
        response: { 200: ClientSchema, 401: ErrorResponseSchema, 404: ErrorResponseSchema },
      },
    },
    async (request) => getClient(db, requireUser(request).id, request.params.id),
  );

  app.patch(
    "/:id",
    {
      schema: {
        tags,
        security,
        summary: "Modifier un client (champs partiels)",
        params: IdParams,
        body: ClientUpdateSchema,
        response: { 200: ClientSchema, 400: ErrorResponseSchema, 401: ErrorResponseSchema, 404: ErrorResponseSchema },
      },
    },
    async (request) => updateClient(db, requireUser(request).id, request.params.id, request.body),
  );

  app.delete(
    "/:id",
    {
      schema: {
        tags,
        security,
        summary: "Supprimer un client (refusé s'il a des devis)",
        params: IdParams,
        response: { 204: z.null().describe("Supprimé"), 401: ErrorResponseSchema, 404: ErrorResponseSchema, 409: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      deleteClient(db, requireUser(request).id, request.params.id);
      return reply.code(204).send(null);
    },
  );
};
