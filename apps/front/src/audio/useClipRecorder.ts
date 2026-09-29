import { useCallback, useEffect, useRef, useState } from "react";
import { startRecorder, type AudioChunk, type Recorder } from "./recorder";
import { encodeWav } from "./wav";

const SAMPLE_RATE = 24_000;
const CHUNK_MS = 80;
/** Audio gardé d'avant l'appui : on commence souvent à parler en appuyant. */
const PREROLL_CHUNKS = 4; // 320 ms
/** Enregistrement prolongé après le relâchement : on relâche souvent avant la fin du mot. */
const TAIL_MS = 300;
const MIN_DURATION_MS = 400;

export type ClipRecorderState = "idle" | "starting" | "ready" | "recording" | "error";

export interface RecordedClip {
  wav: Blob;
  durationMs: number;
  recordedAt: Date;
}

/**
 * Enregistrement « talkie-walkie » : le micro reste ouvert après la première utilisation
 * (pas de délai à l'appui suivant) et seuls les blocs entre `start()` et `stop()` sont gardés.
 */
export function useClipRecorder() {
  const [state, setState] = useState<ClipRecorderState>("idle");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<Promise<Recorder> | null>(null);
  const capturing = useRef(false);
  /** Bouton toujours enfoncé ? (il peut être relâché pendant l'ouverture du micro) */
  const wanted = useRef(false);
  const chunks = useRef<ArrayBuffer[]>([]);
  const preroll = useRef<ArrayBuffer[]>([]);
  const startedAt = useRef<Date | null>(null);

  const onChunk = useCallback(({ pcm, rms }: AudioChunk) => {
    setLevel(rms);
    if (capturing.current) {
      chunks.current.push(pcm);
    } else {
      preroll.current.push(pcm);
      if (preroll.current.length > PREROLL_CHUNKS) preroll.current.shift();
    }
  }, []);

  /** Ouvre le micro une seule fois (la première ouverture déclenche la demande d'autorisation). */
  const ensureMicrophone = useCallback((): Promise<Recorder> => {
    if (!recorderRef.current) {
      setState("starting");
      recorderRef.current = startRecorder(onChunk).catch((err: unknown) => {
        recorderRef.current = null;
        throw err;
      });
    }
    return recorderRef.current;
  }, [onChunk]);

  const start = useCallback(async () => {
    setError(null);
    wanted.current = true;
    try {
      await ensureMicrophone();
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Micro inaccessible");
      return;
    }
    if (!wanted.current) {
      setState("ready");
      return;
    }
    chunks.current = [...preroll.current];
    preroll.current = [];
    startedAt.current = new Date();
    capturing.current = true;
    setState("recording");
  }, [ensureMicrophone]);

  /** Termine l'enregistrement ; null si trop court ou si le micro n'a pas démarré. */
  const stop = useCallback(async (): Promise<RecordedClip | null> => {
    wanted.current = false;
    if (recorderRef.current) await recorderRef.current.catch(() => null);
    if (!capturing.current) return null;
    await new Promise((resolve) => setTimeout(resolve, TAIL_MS));
    capturing.current = false;
    setState("ready");

    const recorded = chunks.current;
    chunks.current = [];
    const durationMs = recorded.length * CHUNK_MS;
    if (durationMs < MIN_DURATION_MS) return null;
    return { wav: encodeWav(recorded, SAMPLE_RATE), durationMs, recordedAt: startedAt.current ?? new Date() };
  }, []);

  useEffect(
    () => () => {
      void recorderRef.current?.then((recorder) => recorder.stop()).catch(() => undefined);
      recorderRef.current = null;
    },
    [],
  );

  return { state, level, error, start, stop };
}
