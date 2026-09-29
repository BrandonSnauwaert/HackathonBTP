import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { z } from "zod";

export type Database = DatabaseSync;
export type SqlParams = Record<string, SQLInputValue>;

/**
 * Migrations appliquées dans l'ordre. La version courante est stockée dans
 * `PRAGMA user_version`. Ne jamais modifier une migration déjà livrée : en ajouter une.
 */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX sessions_user_id ON sessions(user_id);

  -- Profil entreprise de l'artisan (1 par utilisateur) : source des mentions légales du devis.
  CREATE TABLE companies (
    user_id                 TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    name                    TEXT NOT NULL DEFAULT '',
    legal_form              TEXT NOT NULL DEFAULT '',
    address                 TEXT NOT NULL DEFAULT '',
    phone                   TEXT NOT NULL DEFAULT '',
    email                   TEXT NOT NULL DEFAULT '',
    siret                   TEXT NOT NULL DEFAULT '',
    vat_number              TEXT NOT NULL DEFAULT '',
    vat_exempt              INTEGER NOT NULL DEFAULT 0,
    insurer_name            TEXT NOT NULL DEFAULT '',
    insurance_policy_number TEXT NOT NULL DEFAULT '',
    insurance_coverage      TEXT NOT NULL DEFAULT '',
    default_validity_days   INTEGER NOT NULL DEFAULT 30,
    default_payment_terms   TEXT NOT NULL DEFAULT '',
    updated_at              TEXT NOT NULL
  );

  CREATE TABLE clients (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL DEFAULT '',
    phone      TEXT NOT NULL DEFAULT '',
    address    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX clients_user_id ON clients(user_id);

  CREATE TABLE quotes (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id     TEXT NOT NULL REFERENCES clients(id),
    number        TEXT NOT NULL,
    status        TEXT NOT NULL,
    title         TEXT NOT NULL DEFAULT '',
    site_address  TEXT NOT NULL DEFAULT '',
    validity_days INTEGER NOT NULL,
    start_date    TEXT,
    duration      TEXT NOT NULL DEFAULT '',
    payment_terms TEXT NOT NULL DEFAULT '',
    notes         TEXT NOT NULL DEFAULT '',
    public_token  TEXT NOT NULL UNIQUE,
    sent_at       TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    UNIQUE (user_id, number)
  );
  CREATE INDEX quotes_user_id ON quotes(user_id);
  CREATE INDEX quotes_client_id ON quotes(client_id);

  CREATE TABLE quote_lines (
    id               TEXT PRIMARY KEY,
    quote_id         TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    position         INTEGER NOT NULL,
    description      TEXT NOT NULL,
    room             TEXT NOT NULL DEFAULT '',
    quantity         REAL NOT NULL,
    unit             TEXT NOT NULL,
    unit_price_cents INTEGER,
    vat_rate_bp      INTEGER NOT NULL,
    source           TEXT NOT NULL,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );
  CREATE INDEX quote_lines_quote_id ON quote_lines(quote_id);

  -- Historique d'un devis : changements de statut, consultations, envois...
  CREATE TABLE quote_events (
    id          TEXT PRIMARY KEY,
    quote_id    TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    actor       TEXT NOT NULL,
    from_status TEXT,
    to_status   TEXT,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX quote_events_quote_id ON quote_events(quote_id);
  `,
  `
  -- Dictées audio (talkie-walkie) : transcrites puis analysées par le LLM en tâche de fond.
  CREATE TABLE clips (
    id             TEXT PRIMARY KEY,
    quote_id       TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    -- Identifiant généré par le téléphone : un clip renvoyé après une coupure n'est pas dupliqué.
    client_clip_id TEXT,
    status         TEXT NOT NULL,
    audio_file     TEXT NOT NULL,
    duration_ms    INTEGER NOT NULL,
    transcript     TEXT,
    warnings       TEXT NOT NULL DEFAULT '[]',
    error          TEXT,
    attempts       INTEGER NOT NULL DEFAULT 0,
    recorded_at    TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    UNIQUE (quote_id, client_clip_id)
  );
  CREATE INDEX clips_quote_id ON clips(quote_id);

  ALTER TABLE quote_lines ADD COLUMN clip_id TEXT REFERENCES clips(id) ON DELETE SET NULL;
  `,
];

export function openDatabase(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

function migrate(db: Database): void {
  const row = db.prepare("PRAGMA user_version").get();
  const current = typeof row?.user_version === "number" ? row.user_version : 0;
  for (let version = current; version < MIGRATIONS.length; version++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version] ?? "");
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

export function transaction<T>(db: Database, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Première ligne du résultat, validée par le schéma zod (undefined si aucune ligne). */
export function queryOne<T>(db: Database, schema: z.ZodType<T>, sql: string, params: SqlParams = {}): T | undefined {
  const row = db.prepare(sql).get(params);
  return row === undefined ? undefined : schema.parse(row);
}

/** Toutes les lignes du résultat, validées par le schéma zod. */
export function queryAll<T>(db: Database, schema: z.ZodType<T>, sql: string, params: SqlParams = {}): T[] {
  return db
    .prepare(sql)
    .all(params)
    .map((row) => schema.parse(row));
}

/** Exécute une requête d'écriture et renvoie le nombre de lignes modifiées. */
export function execute(db: Database, sql: string, params: SqlParams = {}): number {
  return Number(db.prepare(sql).run(params).changes);
}

/**
 * Construit la clause SET d'un UPDATE à partir des seuls champs fournis.
 * Les noms de colonnes viennent toujours du code (jamais de l'utilisateur).
 */
export function buildSet(columns: Record<string, SQLInputValue | undefined>): { sql: string; params: SqlParams } {
  const params: SqlParams = {};
  const parts: string[] = [];
  for (const [column, value] of Object.entries(columns)) {
    if (value === undefined) continue;
    parts.push(`${column} = :${column}`);
    params[column] = value;
  }
  return { sql: parts.join(", "), params };
}
