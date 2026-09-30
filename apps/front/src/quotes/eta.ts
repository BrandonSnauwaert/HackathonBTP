import type { Clip } from "../api/types";

/**
 * Temps restant avant la fin du traitement des dictées, à partir de l'estimation du serveur
 * (`estimatedReadyAt` : file de transcription puis analyse par le LLM).
 */

/** « moins d'une minute », « ~4 min », « ~1 h 05 » */
export function formatRemaining(readyAt: string, now: Date = new Date()): string {
  const minutes = Math.ceil((Date.parse(readyAt) - now.getTime()) / 60_000);
  if (minutes <= 1) return "moins d'une minute";
  if (minutes < 60) return `~${minutes} min`;
  return `~${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

/** Fin estimée de la dernière dictée en cours (tout sera prêt à ce moment-là), ou null. */
export function lastReadyAt(clips: readonly Clip[]): string | null {
  let last: string | null = null;
  for (const clip of clips) {
    if (clip.estimatedReadyAt && (last === null || clip.estimatedReadyAt > last)) last = clip.estimatedReadyAt;
  }
  return last;
}

/** Durée enregistrée en écoute passive : minutes d'audio encore à traiter (pour prévenir l'artisan). */
export const pendingPassiveMinutes = (clips: readonly Clip[]) =>
  Math.round(
    clips.filter((c) => c.kind === "passive" && c.estimatedReadyAt).reduce((sum, c) => sum + c.durationMs, 0) / 60_000,
  );
