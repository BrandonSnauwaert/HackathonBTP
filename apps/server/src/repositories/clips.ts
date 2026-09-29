import { z } from "zod";
import { buildSet, execute, queryAll, queryOne, type Database } from "../db/database.js";
import { notFound } from "../http/errors.js";
import type { PatchOf } from "../types.js";

export const CLIP_STATUSES = ["pending", "transcribing", "extracting", "done", "failed"] as const;
export type ClipStatus = (typeof CLIP_STATUSES)[number];

export const CLIP_STATUS_LABELS: Record<ClipStatus, string> = {
  pending: "En attente",
  transcribing: "Transcription en cours",
  extracting: "Analyse en cours",
  done: "Traité",
  failed: "Échec",
};

export interface Clip {
  id: string;
  quoteId: string;
  clientClipId: string | null;
  status: ClipStatus;
  audioFile: string;
  durationMs: number;
  transcript: string | null;
  warnings: string[];
  error: string | null;
  attempts: number;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
}

const ClipRow = z
  .object({
    id: z.string(),
    quote_id: z.string(),
    client_clip_id: z.string().nullable(),
    status: z.enum(CLIP_STATUSES),
    audio_file: z.string(),
    duration_ms: z.number(),
    transcript: z.string().nullable(),
    warnings: z.string(),
    error: z.string().nullable(),
    attempts: z.number(),
    recorded_at: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .transform(
    (r): Clip => ({
      id: r.id,
      quoteId: r.quote_id,
      clientClipId: r.client_clip_id,
      status: r.status,
      audioFile: r.audio_file,
      durationMs: r.duration_ms,
      transcript: r.transcript,
      warnings: z.array(z.string()).catch([]).parse(JSON.parse(r.warnings)),
      error: r.error,
      attempts: r.attempts,
      recordedAt: r.recorded_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }),
  );

export function listClips(db: Database, quoteId: string): Clip[] {
  return queryAll(db, ClipRow, "SELECT * FROM clips WHERE quote_id = :quoteId ORDER BY recorded_at, created_at", {
    quoteId,
  });
}

export function getClip(db: Database, quoteId: string, clipId: string): Clip {
  const clip = queryOne(db, ClipRow, "SELECT * FROM clips WHERE id = :clipId AND quote_id = :quoteId", {
    clipId,
    quoteId,
  });
  if (!clip) throw notFound("Dictée introuvable");
  return clip;
}

export function findClipById(db: Database, clipId: string): Clip | undefined {
  return queryOne(db, ClipRow, "SELECT * FROM clips WHERE id = :clipId", { clipId });
}

export function findClipByClientId(db: Database, quoteId: string, clientClipId: string): Clip | undefined {
  return queryOne(db, ClipRow, "SELECT * FROM clips WHERE quote_id = :quoteId AND client_clip_id = :clientClipId", {
    quoteId,
    clientClipId,
  });
}

/** Clips à (re)traiter, par exemple après un redémarrage du serveur. */
export function listUnfinishedClipIds(db: Database): string[] {
  return queryAll(
    db,
    z.object({ id: z.string() }),
    "SELECT id FROM clips WHERE status IN ('pending', 'transcribing', 'extracting') ORDER BY created_at",
  ).map((r) => r.id);
}

/** Propriétaire du devis d'un clip (le traitement de fond n'a pas de requête HTTP). */
export function findClipOwner(db: Database, clipId: string): string | undefined {
  return queryOne(
    db,
    z.object({ user_id: z.string() }),
    "SELECT q.user_id FROM clips c JOIN quotes q ON q.id = c.quote_id WHERE c.id = :clipId",
    { clipId },
  )?.user_id;
}

export function insertClip(
  db: Database,
  clip: Pick<Clip, "id" | "quoteId" | "clientClipId" | "audioFile" | "durationMs" | "recordedAt">,
): void {
  const now = new Date().toISOString();
  execute(
    db,
    `INSERT INTO clips (id, quote_id, client_clip_id, status, audio_file, duration_ms, recorded_at, created_at, updated_at)
     VALUES (:id, :quoteId, :clientClipId, 'pending', :audioFile, :durationMs, :recordedAt, :now, :now)`,
    { ...clip, now },
  );
}

export function updateClip(
  db: Database,
  clipId: string,
  update: PatchOf<Pick<Clip, "status" | "transcript" | "warnings" | "error" | "attempts">>,
): void {
  const set = buildSet({
    status: update.status,
    transcript: update.transcript,
    warnings: update.warnings === undefined ? undefined : JSON.stringify(update.warnings),
    error: update.error,
    attempts: update.attempts,
    updated_at: new Date().toISOString(),
  });
  execute(db, `UPDATE clips SET ${set.sql} WHERE id = :clipId`, { ...set.params, clipId });
}

/** Nombre de lignes de devis créées par chaque clip du devis. */
export function countLinesByClip(db: Database, quoteId: string): Map<string, number> {
  const rows = queryAll(
    db,
    z.object({ clip_id: z.string(), n: z.number() }),
    "SELECT clip_id, COUNT(*) AS n FROM quote_lines WHERE quote_id = :quoteId AND clip_id IS NOT NULL GROUP BY clip_id",
    { quoteId },
  );
  return new Map(rows.map((r) => [r.clip_id, r.n]));
}

/** Clip tel qu'exposé par l'API. */
export type ClipView = Omit<Clip, "quoteId" | "audioFile" | "attempts"> & { statusLabel: string; lineCount: number };

export function toClipView(clip: Clip, lineCount: number): ClipView {
  const { quoteId: _quoteId, audioFile: _audioFile, attempts: _attempts, ...rest } = clip;
  return { ...rest, statusLabel: CLIP_STATUS_LABELS[clip.status], lineCount };
}
