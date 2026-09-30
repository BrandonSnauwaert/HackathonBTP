/**
 * Estimation de l'heure à laquelle chaque dictée en cours sera traitée, pour ne pas laisser
 * l'artisan dans le flou (une écoute passive de 20 min prend ~25 min à traiter).
 *
 * Le traitement se fait en deux files (voir services/clip-service.ts) :
 * - transcription : une dictée à la fois pour tout le serveur, dans l'ordre d'arrivée ;
 *   durée ≈ durée de l'audio × sttSpeedFactor (Kyutai sur la GTX 1660 : ~1,15) ;
 * - analyse (LLM) : dès que le texte est prêt, dans l'ordre des dictées pour un même devis,
 *   en parallèle entre devis ; durée ≈ llmBaseMs + llmMsPerAudioMinute × minutes d'audio.
 */

export interface ClipEstimateOptions {
  /** Temps de transcription / durée de l'audio. */
  sttSpeedFactor: number;
  /** Durée fixe d'un appel au LLM. */
  llmBaseMs: number;
  /** Durée d'analyse ajoutée par minute d'audio (texte plus long à lire et à découper). */
  llmMsPerAudioMinute: number;
}

export interface UnfinishedClip {
  id: string;
  quoteId: string;
  status: "pending" | "transcribing" | "transcribed" | "extracting";
  durationMs: number;
  /** Dernier changement de statut : début de la transcription ou de l'analyse en cours. */
  updatedAt: Date;
}

/** Un traitement déjà en retard sur l'estimation est annoncé comme presque fini, pas dans le passé. */
const OVERDUE_MARGIN_MS = 5_000;

export const analysisMs = (durationMs: number, options: ClipEstimateOptions) =>
  options.llmBaseMs + (options.llmMsPerAudioMinute * durationMs) / 60_000;

/**
 * Heure de fin estimée de chaque dictée non terminée.
 * `clips` : toutes les dictées non terminées du serveur, dans l'ordre de la file de transcription.
 */
export function estimateReadyTimes(
  clips: readonly UnfinishedClip[],
  now: Date,
  options: ClipEstimateOptions,
): Map<string, Date> {
  const floor = now.getTime() + OVERDUE_MARGIN_MS;
  const transcribedAt = new Map<string, number>();

  // 1. File de transcription : la dictée en cours, puis les suivantes l'une après l'autre.
  let cursor = now.getTime();
  const current = clips.find((c) => c.status === "transcribing");
  if (current) {
    cursor = Math.max(floor, current.updatedAt.getTime() + current.durationMs * options.sttSpeedFactor);
    transcribedAt.set(current.id, cursor);
  }
  for (const clip of clips) {
    if (clip.status === "pending") {
      cursor += clip.durationMs * options.sttSpeedFactor;
      transcribedAt.set(clip.id, cursor);
    } else if (clip.status !== "transcribing") {
      transcribedAt.set(clip.id, now.getTime()); // texte déjà prêt
    }
  }

  // 2. Files d'analyse : une par devis, dans l'ordre de fin de transcription.
  const ready = new Map<string, Date>();
  const analysisEnd = new Map<string, number>();
  const byTranscription = [...clips].sort((a, b) => (transcribedAt.get(a.id) ?? 0) - (transcribedAt.get(b.id) ?? 0));
  for (const clip of byTranscription) {
    const duration = analysisMs(clip.durationMs, options);
    let end: number;
    if (clip.status === "extracting") {
      end = Math.max(floor, clip.updatedAt.getTime() + duration);
    } else {
      const start = Math.max(transcribedAt.get(clip.id) ?? now.getTime(), analysisEnd.get(clip.quoteId) ?? 0);
      end = start + duration;
    }
    analysisEnd.set(clip.quoteId, end);
    ready.set(clip.id, new Date(end));
  }
  return ready;
}
