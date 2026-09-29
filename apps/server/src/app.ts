import cookie from "@fastify/cookie";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";
import { setupSession } from "./auth/session.js";
import type { Config } from "./config.js";
import type { Database } from "./db/database.js";
import { HttpError } from "./http/errors.js";
import { transformObject } from "./http/openapi.js";
import { authRoutes } from "./routes/auth.js";
import { clientRoutes } from "./routes/clients.js";
import { companyRoutes } from "./routes/company.js";
import { quoteRoutes } from "./routes/quotes.js";
import { transcriptionRoutes } from "./routes/transcription.js";
import { createQuoteService } from "./services/quote-service.js";

export interface AppOptions {
  config: Config;
  db: Database;
  logger?: boolean;
}

export async function buildApp({ config, db, logger = true }: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send({
        error: "validation",
        message: "Requête invalide",
        details: error.validation.map((v) => ({ path: v.instancePath, message: v.message })),
      });
    }
    if (error instanceof HttpError) {
      const body: { error: string; message: string; details?: unknown } = { error: error.code, message: error.message };
      if (error.details !== undefined) body.details = error.details;
      return reply.code(error.statusCode).send(body);
    }
    const status = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : 500;
    if (status >= 500) request.log.error(error);
    return reply.code(status).send({
      error: status >= 500 ? "internal" : "request_error",
      message: status >= 500 ? "Erreur interne du serveur" : error instanceof Error ? error.message : "Requête invalide",
    });
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "API Devis BTP",
        description:
          "API du projet de devis dictés pour artisans (hackathon Foreach Academy).\n\n" +
          "**Authentification** : `POST /api/auth/login` pose un cookie de session `sid`. Depuis cette page, " +
          "le navigateur le renvoie automatiquement : connectez-vous d'abord, puis testez les autres routes.\n\n" +
          "**Montants** en centimes entiers (`12990` = 129,90 €), **TVA** en points de base (`2000` = 20 %).\n\n" +
          "**Erreurs** : `{ error, message, details? }`. `error` est un code stable, `message` est en français.",
        version: "0.1.0",
      },
      tags: [
        { name: "Auth", description: "Compte et session" },
        { name: "Entreprise", description: "Profil de l'artisan : mentions légales des devis" },
        { name: "Clients" },
        { name: "Devis", description: "Cycle de vie : brouillon → prêt → envoyé → consulté → accepté / refusé" },
        { name: "Lignes de devis" },
        { name: "Système" },
      ],
      components: {
        securitySchemes: { cookieAuth: { type: "apiKey", in: "cookie", name: "sid" } },
      },
    },
    transform: jsonSchemaTransform,
    transformObject,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  await app.register(cookie);
  setupSession(app, db);
  await app.register(websocket);

  app.get(
    "/api/health",
    {
      schema: {
        tags: ["Système"],
        summary: "État du serveur",
        response: { 200: z.object({ status: z.literal("ok"), transcriber: z.string() }) },
      },
    },
    async () => ({ status: "ok" as const, transcriber: config.TRANSCRIBER }),
  );

  const quotes = createQuoteService(db, { followUpAfterDays: config.FOLLOW_UP_AFTER_DAYS });
  await app.register(authRoutes, {
    prefix: "/api/auth",
    db,
    sessionTtlDays: config.SESSION_TTL_DAYS,
    secureCookies: config.COOKIE_SECURE,
  });
  await app.register(companyRoutes, { prefix: "/api/company", db });
  await app.register(clientRoutes, { prefix: "/api/clients", db });
  await app.register(quoteRoutes, { prefix: "/api/quotes", quotes });
  await app.register(transcriptionRoutes, { config });

  return app;
}
