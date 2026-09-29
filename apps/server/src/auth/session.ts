import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Database } from "../db/database.js";
import { HttpError } from "../http/errors.js";
import { findSessionUser, type User } from "../repositories/users.js";

export const SESSION_COOKIE = "sid";

declare module "fastify" {
  interface FastifyRequest {
    /** Utilisateur connecté (cookie de session valide), sinon null. */
    user: User | null;
  }
}

/** Résout l'utilisateur de la session sur chaque requête. À appeler sur l'instance racine. */
export function setupSession(app: FastifyInstance, db: Database): void {
  app.decorateRequest("user", null);
  app.addHook("onRequest", async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    request.user = token ? (findSessionUser(db, token) ?? null) : null;
  });
}

/** Utilisateur connecté, ou erreur 401. */
export function requireUser(request: FastifyRequest): User {
  if (!request.user) throw new HttpError(401, "unauthorized", "Connexion requise");
  return request.user;
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date, secure: boolean): void {
  reply.setCookie(SESSION_COOKIE, token, { path: "/", httpOnly: true, sameSite: "lax", secure, expires: expiresAt });
}

/** Déclaration OpenAPI des routes protégées. */
export const cookieAuth = [{ cookieAuth: [] }];
