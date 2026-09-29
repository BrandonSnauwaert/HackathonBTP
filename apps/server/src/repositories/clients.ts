import { randomUUID } from "node:crypto";
import { z } from "zod";
import { buildSet, execute, queryAll, queryOne, type Database } from "../db/database.js";
import { conflict, notFound } from "../http/errors.js";
import type { PatchOf } from "../types.js";

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  createdAt: string;
  updatedAt: string;
}

export type ClientInput = Pick<Client, "name"> & PatchOf<Pick<Client, "email" | "phone" | "address">>;

const ClientRow = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    phone: z.string(),
    address: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .transform(
    (r): Client => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      address: r.address,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }),
  );

export function listClients(db: Database, userId: string, search?: string): Client[] {
  return queryAll(
    db,
    ClientRow,
    `SELECT * FROM clients WHERE user_id = :userId
       AND (:search IS NULL OR name LIKE :search OR email LIKE :search)
     ORDER BY name COLLATE NOCASE`,
    { userId, search: search ? `%${search}%` : null },
  );
}

export function getClient(db: Database, userId: string, id: string): Client {
  const client = queryOne(db, ClientRow, "SELECT * FROM clients WHERE id = :id AND user_id = :userId", { id, userId });
  if (!client) throw notFound("Client introuvable");
  return client;
}

export function createClient(db: Database, userId: string, input: ClientInput): Client {
  const id = randomUUID();
  const now = new Date().toISOString();
  execute(
    db,
    `INSERT INTO clients (id, user_id, name, email, phone, address, created_at, updated_at)
     VALUES (:id, :userId, :name, :email, :phone, :address, :now, :now)`,
    {
      id,
      userId,
      name: input.name,
      email: input.email ?? "",
      phone: input.phone ?? "",
      address: input.address ?? "",
      now,
    },
  );
  return getClient(db, userId, id);
}

export function updateClient(db: Database, userId: string, id: string, update: PatchOf<ClientInput>): Client {
  getClient(db, userId, id);
  const set = buildSet({
    name: update.name,
    email: update.email,
    phone: update.phone,
    address: update.address,
    updated_at: new Date().toISOString(),
  });
  execute(db, `UPDATE clients SET ${set.sql} WHERE id = :id AND user_id = :userId`, { ...set.params, id, userId });
  return getClient(db, userId, id);
}

export function deleteClient(db: Database, userId: string, id: string): void {
  getClient(db, userId, id);
  const used = queryOne(db, z.object({ n: z.number() }), "SELECT COUNT(*) AS n FROM quotes WHERE client_id = :id", { id });
  if (used && used.n > 0) {
    throw conflict("client_has_quotes", `Ce client a ${used.n} devis : impossible de le supprimer`);
  }
  execute(db, "DELETE FROM clients WHERE id = :id AND user_id = :userId", { id, userId });
}
