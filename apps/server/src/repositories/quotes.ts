import { randomUUID } from "node:crypto";
import { z } from "zod";
import { buildSet, execute, queryAll, queryOne, type Database } from "../db/database.js";
import { QUOTE_STATUSES, type Actor, type QuoteStatus } from "../domain/quote-status.js";
import { UNITS, type Unit } from "../domain/units.js";
import { notFound } from "../http/errors.js";
import type { PatchOf } from "../types.js";

export interface Quote {
  id: string;
  clientId: string;
  number: string;
  status: QuoteStatus;
  title: string;
  siteAddress: string;
  validityDays: number;
  startDate: string | null;
  duration: string;
  paymentTerms: string;
  notes: string;
  publicToken: string;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type LineSource = "manual" | "dictation";

export interface QuoteLine {
  id: string;
  position: number;
  description: string;
  room: string;
  quantity: number;
  unit: Unit;
  unitPriceCents: number | null;
  vatRateBp: number;
  source: LineSource;
  /** Dictée dont la ligne est issue (null pour une ligne saisie à la main). */
  clipId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteEvent {
  id: string;
  type: string;
  actor: Actor;
  fromStatus: QuoteStatus | null;
  toStatus: QuoteStatus | null;
  createdAt: string;
}

const QuoteRow = z
  .object({
    id: z.string(),
    client_id: z.string(),
    number: z.string(),
    status: z.enum(QUOTE_STATUSES),
    title: z.string(),
    site_address: z.string(),
    validity_days: z.number(),
    start_date: z.string().nullable(),
    duration: z.string(),
    payment_terms: z.string(),
    notes: z.string(),
    public_token: z.string(),
    sent_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .transform((r): Quote => ({
    id: r.id,
    clientId: r.client_id,
    number: r.number,
    status: r.status,
    title: r.title,
    siteAddress: r.site_address,
    validityDays: r.validity_days,
    startDate: r.start_date,
    duration: r.duration,
    paymentTerms: r.payment_terms,
    notes: r.notes,
    publicToken: r.public_token,
    sentAt: r.sent_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

const LineRow = z
  .object({
    id: z.string(),
    quote_id: z.string(),
    position: z.number(),
    description: z.string(),
    room: z.string(),
    quantity: z.number(),
    unit: z.enum(UNITS),
    unit_price_cents: z.number().nullable(),
    vat_rate_bp: z.number(),
    source: z.enum(["manual", "dictation"]),
    clip_id: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .transform((r) => ({
    quoteId: r.quote_id,
    line: {
      id: r.id,
      position: r.position,
      description: r.description,
      room: r.room,
      quantity: r.quantity,
      unit: r.unit,
      unitPriceCents: r.unit_price_cents,
      vatRateBp: r.vat_rate_bp,
      source: r.source,
      clipId: r.clip_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    } satisfies QuoteLine,
  }));

const EventRow = z
  .object({
    id: z.string(),
    type: z.string(),
    actor: z.enum(["artisan", "client", "system"]),
    from_status: z.enum(QUOTE_STATUSES).nullable(),
    to_status: z.enum(QUOTE_STATUSES).nullable(),
    created_at: z.string(),
  })
  .transform((r): QuoteEvent => ({
    id: r.id,
    type: r.type,
    actor: r.actor,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    createdAt: r.created_at,
  }));

// --- Devis

export function listQuotes(db: Database, userId: string, status?: QuoteStatus): Quote[] {
  return queryAll(
    db,
    QuoteRow,
    `SELECT * FROM quotes WHERE user_id = :userId AND (:status IS NULL OR status = :status)
     ORDER BY created_at DESC`,
    { userId, status: status ?? null },
  );
}

export function getQuote(db: Database, userId: string, id: string): Quote {
  const quote = queryOne(db, QuoteRow, "SELECT * FROM quotes WHERE id = :id AND user_id = :userId", { id, userId });
  if (!quote) throw notFound("Devis introuvable");
  return quote;
}

/** Prochain numéro chronologique de l'année : D-2026-0001, D-2026-0002... */
export function nextQuoteNumber(db: Database, userId: string, year: number): string {
  const prefix = `D-${year}-`;
  const row = queryOne(
    db,
    z.object({ max: z.number().nullable() }),
    `SELECT MAX(CAST(substr(number, :start) AS INTEGER)) AS max FROM quotes
     WHERE user_id = :userId AND number LIKE :pattern`,
    { userId, start: prefix.length + 1, pattern: `${prefix}%` },
  );
  return `${prefix}${String((row?.max ?? 0) + 1).padStart(4, "0")}`;
}

export type NewQuote = Omit<Quote, "createdAt" | "updatedAt" | "sentAt">;

export function insertQuote(db: Database, userId: string, quote: NewQuote): void {
  const now = new Date().toISOString();
  execute(
    db,
    `INSERT INTO quotes (id, user_id, client_id, number, status, title, site_address, validity_days, start_date,
       duration, payment_terms, notes, public_token, created_at, updated_at)
     VALUES (:id, :userId, :clientId, :number, :status, :title, :siteAddress, :validityDays, :startDate,
       :duration, :paymentTerms, :notes, :publicToken, :now, :now)`,
    { ...quote, userId, now },
  );
}

export type QuoteUpdate = PatchOf<
  Pick<
    Quote,
    | "clientId"
    | "status"
    | "title"
    | "siteAddress"
    | "validityDays"
    | "startDate"
    | "duration"
    | "paymentTerms"
    | "notes"
    | "sentAt"
  >
>;

export function updateQuote(db: Database, id: string, update: QuoteUpdate): void {
  const set = buildSet({
    client_id: update.clientId,
    status: update.status,
    title: update.title,
    site_address: update.siteAddress,
    validity_days: update.validityDays,
    start_date: update.startDate,
    duration: update.duration,
    payment_terms: update.paymentTerms,
    notes: update.notes,
    sent_at: update.sentAt,
    updated_at: new Date().toISOString(),
  });
  execute(db, `UPDATE quotes SET ${set.sql} WHERE id = :id`, { ...set.params, id });
}

export function deleteQuote(db: Database, id: string): void {
  execute(db, "DELETE FROM quotes WHERE id = :id", { id });
}

// --- Lignes

export function listLines(db: Database, quoteId: string): QuoteLine[] {
  return queryAll(db, LineRow, "SELECT * FROM quote_lines WHERE quote_id = :quoteId ORDER BY position", {
    quoteId,
  }).map((r) => r.line);
}

/** Lignes de tous les devis d'un utilisateur, groupées par devis (pour les totaux de la liste). */
export function listLinesByQuote(db: Database, userId: string): Map<string, QuoteLine[]> {
  const rows = queryAll(
    db,
    LineRow,
    `SELECT l.* FROM quote_lines l JOIN quotes q ON q.id = l.quote_id
     WHERE q.user_id = :userId ORDER BY l.position`,
    { userId },
  );
  const byQuote = new Map<string, QuoteLine[]>();
  for (const { quoteId, line } of rows) {
    const lines = byQuote.get(quoteId) ?? [];
    lines.push(line);
    byQuote.set(quoteId, lines);
  }
  return byQuote;
}

export function getLine(db: Database, quoteId: string, lineId: string): QuoteLine {
  const row = queryOne(db, LineRow, "SELECT * FROM quote_lines WHERE id = :lineId AND quote_id = :quoteId", {
    lineId,
    quoteId,
  });
  if (!row) throw notFound("Ligne introuvable");
  return row.line;
}

export type LineInput = Pick<QuoteLine, "description" | "quantity" | "unit" | "vatRateBp"> &
  PatchOf<Pick<QuoteLine, "room" | "unitPriceCents" | "source" | "clipId">>;

export function insertLine(db: Database, quoteId: string, input: LineInput): QuoteLine {
  const id = randomUUID();
  const now = new Date().toISOString();
  execute(
    db,
    `INSERT INTO quote_lines (id, quote_id, position, description, room, quantity, unit, unit_price_cents,
       vat_rate_bp, source, clip_id, created_at, updated_at)
     VALUES (:id, :quoteId,
       (SELECT COALESCE(MAX(position), 0) + 1 FROM quote_lines WHERE quote_id = :quoteId),
       :description, :room, :quantity, :unit, :unitPriceCents, :vatRateBp, :source, :clipId, :now, :now)`,
    {
      id,
      quoteId,
      description: input.description,
      room: input.room ?? "",
      quantity: input.quantity,
      unit: input.unit,
      unitPriceCents: input.unitPriceCents ?? null,
      vatRateBp: input.vatRateBp,
      source: input.source ?? "manual",
      clipId: input.clipId ?? null,
      now,
    },
  );
  return getLine(db, quoteId, id);
}

export function updateLine(db: Database, quoteId: string, lineId: string, update: PatchOf<LineInput>): QuoteLine {
  getLine(db, quoteId, lineId);
  const set = buildSet({
    description: update.description,
    room: update.room,
    quantity: update.quantity,
    unit: update.unit,
    unit_price_cents: update.unitPriceCents,
    vat_rate_bp: update.vatRateBp,
    updated_at: new Date().toISOString(),
  });
  execute(db, `UPDATE quote_lines SET ${set.sql} WHERE id = :lineId AND quote_id = :quoteId`, {
    ...set.params,
    lineId,
    quoteId,
  });
  return getLine(db, quoteId, lineId);
}

export function deleteLine(db: Database, quoteId: string, lineId: string): void {
  getLine(db, quoteId, lineId);
  execute(db, "DELETE FROM quote_lines WHERE id = :lineId AND quote_id = :quoteId", { lineId, quoteId });
  renumberLines(
    db,
    quoteId,
    listLines(db, quoteId).map((l) => l.id),
  );
}

/** Réécrit les positions (1, 2, 3...) dans l'ordre des identifiants fournis. */
export function renumberLines(db: Database, quoteId: string, orderedIds: readonly string[]): void {
  orderedIds.forEach((lineId, index) => {
    execute(db, "UPDATE quote_lines SET position = :position WHERE id = :lineId AND quote_id = :quoteId", {
      position: index + 1,
      lineId,
      quoteId,
    });
  });
}

// --- Historique

export function insertEvent(
  db: Database,
  quoteId: string,
  event: { type: string; actor: Actor; fromStatus?: QuoteStatus; toStatus?: QuoteStatus; at?: Date },
): void {
  execute(
    db,
    `INSERT INTO quote_events (id, quote_id, type, actor, from_status, to_status, created_at)
     VALUES (:id, :quoteId, :type, :actor, :fromStatus, :toStatus, :createdAt)`,
    {
      id: randomUUID(),
      quoteId,
      type: event.type,
      actor: event.actor,
      fromStatus: event.fromStatus ?? null,
      toStatus: event.toStatus ?? null,
      createdAt: (event.at ?? new Date()).toISOString(),
    },
  );
}

export function listEvents(db: Database, quoteId: string): QuoteEvent[] {
  return queryAll(db, EventRow, "SELECT * FROM quote_events WHERE quote_id = :quoteId ORDER BY created_at, rowid", {
    quoteId,
  });
}
