import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../api/client";
import type { Clip, QuoteDetail } from "../api/types";
import type { RecordedClip } from "../audio/useClipRecorder";

const POLL_MS = 1000;

/** Dictée en cours d'envoi, gardée en mémoire pour pouvoir la renvoyer en cas d'échec. */
export interface Upload {
  clientClipId: string;
  clip: RecordedClip;
  error: string | null;
}

export const isProcessing = (clip: Clip) => clip.status !== "done" && clip.status !== "failed";
export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Erreur inattendue");

/**
 * Un devis et ses actions : chargement, modifications (l'API renvoie le devis complet),
 * envoi des dictées, rafraîchissement tant qu'une dictée est en cours de traitement.
 */
export function useQuote(quoteId: string) {
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);

  const load = useCallback(async () => {
    try {
      setQuote(await api.getQuote(quoteId));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [quoteId]);

  useEffect(() => {
    // Chargement de données depuis l'API : c'est bien une synchronisation avec un système externe.
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);

  const processing = quote?.clips.some(isProcessing) ?? false;
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [processing, load]);

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

  const send = useCallback(
    async (upload: Upload) => {
      setUploads((list) => [...list.filter((u) => u.clientClipId !== upload.clientClipId), { ...upload, error: null }]);
      try {
        await api.uploadClip(quoteId, upload.clip.wav, upload.clientClipId, upload.clip.recordedAt);
        setUploads((list) => list.filter((u) => u.clientClipId !== upload.clientClipId));
        await load();
      } catch (err) {
        setUploads((list) =>
          list.map((u) => (u.clientClipId === upload.clientClipId ? { ...u, error: errorMessage(err) } : u)),
        );
      }
    },
    [quoteId, load],
  );

  const addClip = useCallback(
    (clip: RecordedClip) => void send({ clientClipId: crypto.randomUUID(), clip, error: null }),
    [send],
  );

  const retryClip = useCallback(
    (clipId: string) => void api.retryClip(quoteId, clipId).then(load, (err: unknown) => setError(errorMessage(err))),
    [quoteId, load],
  );

  return { quote, error, setError, uploads, processing, load, run, send, addClip, retryClip };
}
