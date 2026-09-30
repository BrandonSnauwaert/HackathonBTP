import { useEffect, useRef, useState } from "react";
import type { RecordedClip, useClipRecorder } from "./useClipRecorder";

type Recorder = ReturnType<typeof useClipRecorder>;

/** Un segment est envoyé toutes les 4 min 30 : sous la limite du serveur (5 min), une coupure ne perd qu'un segment. */
export const SEGMENT_MS = 270_000;

/**
 * Écoute passive : toute la visite est enregistrée, découpée en segments envoyés au fil de l'eau
 * (hors connexion, ils attendent sur le téléphone comme les dictées).
 * Si l'écran est quitté en pleine écoute, le dernier segment est quand même envoyé.
 */
export function usePassiveListening(
  recorder: Recorder,
  onSegment: (clip: RecordedClip) => void,
  segmentMs = SEGMENT_MS,
) {
  const [listening, setListening] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [segments, setSegments] = useState(0);
  const startedAt = useRef(0);
  const lastSplit = useRef(0);
  // Toujours la dernière version, pour le découpage périodique et la sortie de l'écran.
  const latest = useRef({ recorder, onSegment });
  useEffect(() => {
    latest.current = { recorder, onSegment };
  });

  const emit = (clip: RecordedClip | null) => {
    if (!clip) return;
    latest.current.onSegment(clip);
    setSegments((n) => n + 1);
  };

  useEffect(() => {
    if (!listening) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setElapsedMs(now - startedAt.current);
      if (now - lastSplit.current >= segmentMs) {
        lastSplit.current = now;
        const clip = latest.current.recorder.split();
        if (clip) {
          latest.current.onSegment(clip);
          setSegments((n) => n + 1);
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [listening, segmentMs]);

  useEffect(
    () => () => {
      const clip = latest.current.recorder.split();
      if (clip) latest.current.onSegment(clip);
    },
    [],
  );

  /** false si le micro est inaccessible (l'erreur est dans recorder.error). */
  const start = async (): Promise<boolean> => {
    if (!(await recorder.start())) return false;
    const now = Date.now();
    startedAt.current = now;
    lastSplit.current = now;
    setElapsedMs(0);
    setSegments(0);
    setListening(true);
    return true;
  };

  const stop = async () => {
    setListening(false);
    emit(await recorder.stop());
  };

  return { listening, elapsedMs, segments, segmentMs, start, stop };
}
