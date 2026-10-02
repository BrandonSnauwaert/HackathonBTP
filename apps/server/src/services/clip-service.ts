import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { InvalidAudioError, encodeWav, pcm16DurationMs, wavToPcm16 } from "../audio/wav.js";
import type { Database } from "../db/database.js";
import { HttpError } from "../http/errors.js";
import type { LineExtractor } from "../llm/line-extractor.js";
import {
  countLinesByClip,
  findClipByClientId,
  findClipById,
  findClipOwner,
  getClip,
  insertClip,
  listClips,
  listUnfinishedClipIds,
  toClipView,
  updateClip,
  type Clip,
  type ClipKind,
  type ClipView,
} from "../repositories/clips.js";
import { getQuote, listLines } from "../repositories/quotes.js";
import type { Logger } from "../transcription/kyutai-transcriber.js";
import { transcribeAudio } from "../transcription/transcribe-audio.js";
import type { Transcriber } from "../transcription/transcriber.js";
import type { ClipEstimator } from "./clip-estimates.js";
import type { QuoteService } from "./quote-service.js";

export interface ClipServiceDeps {
  db: Database;
  quotes: QuoteService;
  clipsDir: string;
  maxClipSeconds: number;
  createTranscriber: () => Transcriber;
  extractor: LineExtractor;
  logger: Logger;
  estimateClips: ClipEstimator;
}

export interface UploadMeta {
  /** Identifiant généré par le téléphone, pour ne pas dupliquer un clip renvoyé. */
  clientClipId?: string | undefined;
  /** Moment de l'enregistrement (la dictée a pu être faite hors connexion bien avant l'envoi). */
  recordedAt?: string | undefined;
  /** Dictée talkie-walkie (par défaut) ou segment d'écoute passive. */
  kind?: ClipKind | undefined;
}

const MIN_CLIP_MS = 300;
const isFinished = (clip: Clip) => clip.status === "done" || clip.status === "failed";

/**
 * Dictées audio : dépôt, puis traitement en tâche de fond, en deux files :
 * - transcription (Kyutai, GPU local) : un clip à la fois, sans attendre le LLM ;
 * - analyse (LLM, sur une autre machine) : dès qu'une transcription est prête. Pour un même
 *   devis, les analyses restent dans l'ordre des dictées (ordre des lignes, et chaque analyse
 *   voit les lignes des précédentes pour éviter les doublons) ; deux devis s'analysent en parallèle.
 */
export function createClipService(deps: ClipServiceDeps) {
  const { db, quotes, clipsDir, logger } = deps;
  let transcriptionQueue: Promise<void> = Promise.resolve();
  const analysisQueues = new Map<string, Promise<void>>();
  const listeners = new Map<string, Set<() => void>>();

  function view(clip: Clip): ClipView {
    const estimate = isFinished(clip) ? undefined : deps.estimateClips().get(clip.id);
    return toClipView(clip, countLinesByClip(db, clip.quoteId).get(clip.id) ?? 0, estimate);
  }

  function notify(clipId: string): void {
    for (const listener of listeners.get(clipId) ?? []) listener();
    listeners.delete(clipId);
  }

  function fail(clipId: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    updateClip(db, clipId, { status: "failed", error: message });
    logger.error({ err, clipId }, "échec du traitement de la dictée");
    notify(clipId);
  }

  /** Étape 1 (file de transcription) : audio → texte, puis passe la main à l'analyse. */
  async function transcribe(clipId: string): Promise<void> {
    const clip = findClipById(db, clipId);
    if (!clip || isFinished(clip)) return;
    try {
      updateClip(db, clipId, { status: "transcribing", attempts: clip.attempts + 1, error: null });
      const pcm = wavToPcm16(await readFile(join(clipsDir, clip.audioFile)));
      const transcript = await transcribeAudio(deps.createTranscriber(), pcm);
      updateClip(db, clipId, { status: "transcribed", transcript });
    } catch (err) {
      fail(clipId, err);
      return;
    }
    scheduleAnalysis(clip.quoteId, clipId);
  }

  function scheduleAnalysis(quoteId: string, clipId: string): void {
    const previous = analysisQueues.get(quoteId) ?? Promise.resolve();
    const next = previous.then(() => analyze(clipId));
    analysisQueues.set(quoteId, next);
    // Libère l'entrée quand la file du devis est vide.
    void next.then(() => {
      if (analysisQueues.get(quoteId) === next) analysisQueues.delete(quoteId);
    });
  }

  /** Étape 2 (file d'analyse du devis) : texte → lignes de devis par le LLM. */
  async function analyze(clipId: string): Promise<void> {
    const clip = findClipById(db, clipId);
    const userId = findClipOwner(db, clipId);
    if (!clip || !userId || isFinished(clip) || clip.transcript === null) return;
    const transcript = clip.transcript;

    try {
      updateClip(db, clipId, { status: "extracting", error: null });
      if (!transcript.trim()) {
        updateClip(db, clipId, { status: "done", warnings: ["Aucune parole détectée dans l'enregistrement"] });
        notify(clipId);
        return;
      }
      const result = await deps.extractor.extract({
        transcript,
        kind: clip.kind,
        existingLines: listLines(db, clip.quoteId).map((l) => ({
          id: l.id,
          description: l.description,
          room: l.room,
          quantity: l.quantity,
          unit: l.unit,
          vatRateBp: l.vatRateBp,
        })),
      });
      quotes.applyDictation(userId, clip.quoteId, clipId, result);
      const changed = result.lines.length + result.updates.length + result.deletions.length > 0;
      const warnings = changed ? result.warnings : ["Aucune prestation détectée dans la dictée", ...result.warnings];
      updateClip(db, clipId, { status: "done", warnings });
      logger.info(
        { clipId, added: result.lines.length, updated: result.updates.length, deleted: result.deletions.length },
        "dictée traitée",
      );
      notify(clipId);
    } catch (err) {
      fail(clipId, err);
    }
  }

  /** Met un clip en file : transcription s'il n'a pas encore de texte, sinon directement l'analyse. */
  function enqueue(clipId: string): void {
    const clip = findClipById(db, clipId);
    if (!clip) return;
    if (clip.transcript === null) {
      transcriptionQueue = transcriptionQueue.then(() => transcribe(clipId));
    } else {
      scheduleAnalysis(clip.quoteId, clipId);
    }
  }

  /** Se résout quand le clip est traité (ou en échec), ou au bout du délai. */
  function waitFor(clipId: string, timeoutMs: number): Promise<void> {
    const clip = findClipById(db, clipId);
    if (!clip || isFinished(clip)) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(done, timeoutMs);
      function done() {
        clearTimeout(timer);
        listeners.get(clipId)?.delete(done);
        resolve();
      }
      const set = listeners.get(clipId) ?? new Set();
      set.add(done);
      listeners.set(clipId, set);
    });
  }

  return {
    async upload(
      userId: string,
      quoteId: string,
      audio: Buffer,
      meta: UploadMeta,
    ): Promise<{ clip: ClipView; created: boolean }> {
      quotes.assertEditable(userId, quoteId);
      if (meta.clientClipId) {
        const existing = findClipByClientId(db, quoteId, meta.clientClipId);
        if (existing) return { clip: view(existing), created: false };
      }

      let pcm: Buffer;
      try {
        pcm = wavToPcm16(audio);
      } catch (err) {
        if (err instanceof InvalidAudioError) throw new HttpError(400, "invalid_audio", err.message);
        throw err;
      }
      const durationMs = pcm16DurationMs(pcm);
      if (durationMs < MIN_CLIP_MS) throw new HttpError(400, "clip_too_short", "Enregistrement trop court");
      if (durationMs > deps.maxClipSeconds * 1000) {
        throw new HttpError(400, "clip_too_long", `Enregistrement trop long (${deps.maxClipSeconds} s maximum)`);
      }

      const id = randomUUID();
      const audioFile = `${id}.wav`;
      await mkdir(clipsDir, { recursive: true });
      await writeFile(join(clipsDir, audioFile), encodeWav(pcm));
      try {
        insertClip(db, {
          id,
          quoteId,
          clientClipId: meta.clientClipId ?? null,
          kind: meta.kind ?? "dictation",
          audioFile,
          durationMs,
          recordedAt: meta.recordedAt ?? new Date().toISOString(),
        });
      } catch (err) {
        // Deux envois simultanés du même clip : le second récupère le premier.
        const existing = meta.clientClipId ? findClipByClientId(db, quoteId, meta.clientClipId) : undefined;
        if (existing) return { clip: view(existing), created: false };
        throw err;
      }
      enqueue(id);
      return { clip: view(getClip(db, quoteId, id)), created: true };
    },

    list(userId: string, quoteId: string): ClipView[] {
      getQuote(db, userId, quoteId);
      return listClips(db, quoteId).map(view);
    },

    get(userId: string, quoteId: string, clipId: string): ClipView {
      getQuote(db, userId, quoteId);
      return view(getClip(db, quoteId, clipId));
    },

    audioPath(userId: string, quoteId: string, clipId: string): string {
      getQuote(db, userId, quoteId);
      return join(clipsDir, getClip(db, quoteId, clipId).audioFile);
    },

    retry(userId: string, quoteId: string, clipId: string): ClipView {
      quotes.assertEditable(userId, quoteId);
      const clip = getClip(db, quoteId, clipId);
      if (clip.status !== "failed") {
        throw new HttpError(409, "clip_not_failed", "Seule une dictée en échec peut être relancée");
      }
      updateClip(db, clipId, { status: "pending", error: null });
      enqueue(clipId);
      return view(getClip(db, quoteId, clipId));
    },

    waitFor,

    /** Relance les clips restés en cours (redémarrage du serveur). */
    resume(): void {
      const ids = listUnfinishedClipIds(db);
      if (ids.length > 0) logger.info({ count: ids.length }, "reprise des dictées en attente");
      for (const id of ids) enqueue(id);
    },
  };
}

export type ClipService = ReturnType<typeof createClipService>;
