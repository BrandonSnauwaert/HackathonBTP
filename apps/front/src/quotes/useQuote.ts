import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../api/client";
import type { Clip, ClipKind, QuoteDetail } from "../api/types";
import type { RecordedClip } from "../audio/useClipRecorder";
import { enqueueClip, onClipSent, retryQueued, useClipQueue } from "../offline/clipQueue";

/** Rafraîchissement pendant le traitement d'une dictée. */
const POLL_MS = 1000;
/** Rafraîchissement d'un devis envoyé : le client peut l'ouvrir ou y répondre à tout moment. */
const LIVE_POLL_MS = 3000;
const LIVE_STATUSES = new Set(["sent", "viewed", "follow_up"]);

/** Dictée pas encore arrivée sur le serveur (file du téléphone). */
export interface Upload {
  clientClipId: string;
  /** En attente du réseau (hors connexion) plutôt qu'en cours d'envoi. */
  waiting: boolean;
  error: string | null;
}

export const isProcessing = (clip: Clip) => clip.status !== "done" && clip.status !== "failed";
export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Erreur inattendue");

export const isNetworkError = (err: unknown) => err instanceof ApiError && err.status === 0;

/** Dernier état connu du devis, gardé sur le téléphone : l'app rouverte sans réseau l'affiche quand même. */
const cacheKey = (quoteId: string) => `devis-vocal:quote:${quoteId}`;

function readCachedQuote(quoteId: string): QuoteDetail | null {
  try {
    const raw = localStorage.getItem(cacheKey(quoteId));
    return raw ? (JSON.parse(raw) as QuoteDetail) : null;
  } catch {
    return null;
  }
}

function cacheQuote(quote: QuoteDetail) {
  try {
    localStorage.setItem(cacheKey(quote.id), JSON.stringify(quote));
  } catch {
    // Stockage plein ou indisponible : le devis sera rechargé depuis le serveur.
  }
}

/**
 * Un devis et ses actions : chargement, modifications (l'API renvoie le devis complet),
 * dictées (via la file hors connexion), rafraîchissement pendant le traitement d'une dictée
 * et tant que le devis attend la réponse du client.
 */
export function useQuote(quoteId: string) {
  const [quote, setQuote] = useState<QuoteDetail | null>(() => readCachedQuote(quoteId));
  const [error, setError] = useState<string | null>(null);
  const queue = useClipQueue();

  const uploads: Upload[] = queue.clips
    .filter((clip) => clip.quoteId === quoteId)
    .map((clip) => ({
      clientClipId: clip.clientClipId,
      waiting: !queue.online && queue.sending !== clip.clientClipId,
      error: clip.error,
    }));

  const load = useCallback(async () => {
    try {
      setQuote(await api.getQuote(quoteId));
      setError(null);
    } catch (err) {
      // Hors connexion, on garde le devis affiché : le bandeau « hors connexion » suffit.
      setError((previous) => (isNetworkError(err) ? previous : errorMessage(err)));
    }
  }, [quoteId]);

  useEffect(() => {
    // Chargement de données depuis l'API : c'est bien une synchronisation avec un système externe.
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (quote) cacheQuote(quote);
  }, [quote]);

  const processing = quote?.clips.some(isProcessing) ?? false;
  const live = quote !== null && LIVE_STATUSES.has(quote.status);
  useEffect(() => {
    if (!processing && !live) return;
    const timer = setInterval(() => void load(), processing ? POLL_MS : LIVE_POLL_MS);
    return () => clearInterval(timer);
  }, [processing, live, load]);

  // Une dictée de la file vient d'arriver sur le serveur : son traitement commence.
  useEffect(() => onClipSent((id) => id === quoteId && void load()), [quoteId, load]);

  /** Applique une réponse de l'API (devis complet) ; en cas d'erreur, l'affiche et recharge. */
  const run = useCallback(
    async (action: () => Promise<QuoteDetail>): Promise<boolean> => {
      setError(null);
      try {
        setQuote(await action());
        return true;
      } catch (err) {
        const issues =
          err instanceof ApiError && err.code === "quote_incomplete" ? " (voir les points à compléter)" : "";
        setError(errorMessage(err) + issues);
        await load();
        return false;
      }
    },
    [load],
  );

  const send = useCallback((upload: Upload) => retryQueued(upload.clientClipId), []);

  /** kind : dictée talkie-walkie (défaut) ou segment d'écoute passive. */
  const addClip = useCallback(
    (clip: RecordedClip, kind: ClipKind = "dictation") =>
      void enqueueClip({
        quoteId,
        kind,
        wav: clip.wav,
        durationMs: clip.durationMs,
        recordedAt: clip.recordedAt,
      }).catch((err: unknown) => setError(`Enregistrement non gardé sur le téléphone : ${errorMessage(err)}`)),
    [quoteId],
  );

  const retryClip = useCallback(
    (clipId: string) => void api.retryClip(quoteId, clipId).then(load, (err: unknown) => setError(errorMessage(err))),
    [quoteId, load],
  );

  return { quote, error, setError, uploads, online: queue.online, processing, load, run, send, addClip, retryClip };
}
