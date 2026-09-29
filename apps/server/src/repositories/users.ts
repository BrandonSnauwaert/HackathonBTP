import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { execute, queryOne, type Database } from "../db/database.js";

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

const UserRow = z
  .object({ id: z.string(), email: z.string(), password_hash: z.string(), created_at: z.string() })
  .transform((r) => ({ id: r.id, email: r.email, passwordHash: r.password_hash, createdAt: r.created_at }));

export function findUserByEmail(db: Database, email: string) {
  return queryOne(db, UserRow, "SELECT * FROM users WHERE email = :email", { email });
}

export function findUserById(db: Database, id: string): User | undefined {
  const row = queryOne(db, UserRow, "SELECT * FROM users WHERE id = :id", { id });
  return row && { id: row.id, email: row.email, createdAt: row.createdAt };
}

/** Crée l'utilisateur et son profil entreprise vide. */
export function createUser(db: Database, email: string, passwordHash: string): User {
  const user: User = { id: randomUUID(), email, createdAt: new Date().toISOString() };
  execute(db, "INSERT INTO users (id, email, password_hash, created_at) VALUES (:id, :email, :hash, :now)", {
    id: user.id,
    email,
    hash: passwordHash,
    now: user.createdAt,
  });
  execute(db, "INSERT INTO companies (user_id, email, updated_at) VALUES (:id, :email, :now)", {
    id: user.id,
    email,
    now: user.createdAt,
  });
  return user;
}

// --- Sessions : le cookie contient un jeton aléatoire, la base n'en stocke que le hash.

const hashToken = (token: string) => createHash("sha256").update(token).digest("base64url");

export function createSession(db: Database, userId: string, ttlDays: number): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  execute(db, "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (:hash, :userId, :expiresAt)", {
    hash: hashToken(token),
    userId,
    expiresAt: expiresAt.toISOString(),
  });
  return { token, expiresAt };
}

const SessionRow = z.object({ user_id: z.string(), expires_at: z.string() });

/** Utilisateur de la session, ou undefined si le jeton est inconnu ou expiré. */
export function findSessionUser(db: Database, token: string): User | undefined {
  const session = queryOne(db, SessionRow, "SELECT user_id, expires_at FROM sessions WHERE token_hash = :hash", {
    hash: hashToken(token),
  });
  if (!session) return undefined;
  if (new Date(session.expires_at) <= new Date()) {
    deleteSession(db, token);
    return undefined;
  }
  return findUserById(db, session.user_id);
}

/** Nettoyage au démarrage : les sessions expirées ne servent plus à rien. */
export function deleteExpiredSessions(db: Database): number {
  return execute(db, "DELETE FROM sessions WHERE expires_at <= :now", { now: new Date().toISOString() });
}

export function deleteSession(db: Database, token: string): void {
  execute(db, "DELETE FROM sessions WHERE token_hash = :hash", { hash: hashToken(token) });
}
