import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { SESSION_COOKIE, cookieAuth, requireUser, setSessionCookie } from "../auth/session.js";
import type { Database } from "../db/database.js";
import { ErrorResponseSchema, HttpError, conflict } from "../http/errors.js";
import { CredentialsSchema, UserSchema } from "../http/schemas.js";
import { createSession, createUser, deleteSession, findUserByEmail } from "../repositories/users.js";

export interface AuthRoutesOptions {
  db: Database;
  sessionTtlDays: number;
  secureCookies: boolean;
  /** Tentatives autorisées par minute et par adresse IP. */
  authRateLimit: number;
}

const UserResponse = z.object({ user: UserSchema });

export const authRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (
  app,
  { db, sessionTtlDays, secureCookies, authRateLimit },
) => {
  app.post(
    "/register",
    {
      config: { rateLimit: { max: authRateLimit, timeWindow: "1 minute" } },
      schema: {
        tags: ["Auth"],
        summary: "Créer un compte artisan (et se connecter)",
        body: CredentialsSchema,
        response: { 201: UserResponse, 400: ErrorResponseSchema, 409: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      if (findUserByEmail(db, email)) throw conflict("email_taken", "Un compte existe déjà avec cette adresse");
      const user = createUser(db, email, await hashPassword(password));
      const session = createSession(db, user.id, sessionTtlDays);
      setSessionCookie(reply, session.token, session.expiresAt, secureCookies);
      return reply.code(201).send({ user });
    },
  );

  app.post(
    "/login",
    {
      config: { rateLimit: { max: authRateLimit, timeWindow: "1 minute" } },
      schema: {
        tags: ["Auth"],
        summary: "Se connecter (pose le cookie de session `sid`)",
        body: CredentialsSchema,
        response: { 200: UserResponse, 401: ErrorResponseSchema, 429: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const found = findUserByEmail(db, email);
      if (!found || !(await verifyPassword(password, found.passwordHash))) {
        throw new HttpError(401, "invalid_credentials", "E-mail ou mot de passe incorrect");
      }
      const session = createSession(db, found.id, sessionTtlDays);
      setSessionCookie(reply, session.token, session.expiresAt, secureCookies);
      return { user: { id: found.id, email: found.email, createdAt: found.createdAt } };
    },
  );

  app.post(
    "/logout",
    { schema: { tags: ["Auth"], summary: "Se déconnecter", security: cookieAuth } },
    async (request, reply) => {
      const token = request.cookies[SESSION_COOKIE];
      if (token) deleteSession(db, token);
      reply.clearCookie(SESSION_COOKIE, { path: "/" });
      return reply.code(204).send();
    },
  );

  app.get(
    "/me",
    {
      schema: {
        tags: ["Auth"],
        summary: "Utilisateur connecté",
        security: cookieAuth,
        response: { 200: UserResponse, 401: ErrorResponseSchema },
      },
    },
    async (request) => ({ user: requireUser(request) }),
  );
};
