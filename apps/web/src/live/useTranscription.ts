import { useCallback, useEffect, useRef, useState } from "react";
import { startRecorder, type Recorder } from "../audio/recorder";

export type Status = "idle" | "connecting" | "recording" | "error";

export interface Segment {
  id: number;
  text: string;
  at: Date;
}

interface TranscriptMessage {
  type: "transcript";
  text: string;
  isFinal: boolean;
}

function isTranscriptMessage(value: unknown): value is TranscriptMessage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.type === "transcript" && typeof v.text === "string" && typeof v.isFinal === "boolean";
}

function wsUrl(): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws`;
}

export function useTranscription() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [partial, setPartial] = useState("");
  const [level, setLevel] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<Recorder | null>(null);
  const nextId = useRef(0);

  const cleanup = useCallback(async () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    const socket = socketRef.current;
    socketRef.current = null;
    socket?.close();
    await recorder?.stop();
    setLevel(0);
  }, []);

  const stop = useCallback(async () => {
    await cleanup();
    setPartial("");
    setStatus("idle");
  }, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    setStatus("connecting");

    const fail = (message: string) => {
      void cleanup();
      setError(message);
      setStatus("error");
    };

    const socket = new WebSocket(wsUrl());
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;

    socket.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      const message: unknown = JSON.parse(event.data);
      if (!isTranscriptMessage(message)) return;
      if (message.isFinal) {
        const id = nextId.current++;
        setSegments((prev) => [...prev, { id, text: message.text, at: new Date() }]);
        setPartial("");
      } else {
        setPartial(message.text);
      }
    };

    socket.onclose = () => {
      if (socketRef.current === socket) fail("Connexion au serveur perdue");
    };

    try {
      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onerror = () => reject(new Error("Serveur injoignable"));
      });
      recorderRef.current = await startRecorder(({ pcm, rms }) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(pcm);
        setLevel(rms);
      });
      setStatus("recording");
    } catch (err) {
      fail(err instanceof Error ? err.message : "Impossible de démarrer l'enregistrement");
    }
  }, [cleanup]);

  useEffect(() => () => void cleanup(), [cleanup]);

  const clear = useCallback(() => {
    setSegments([]);
    setPartial("");
  }, []);

  return { status, error, segments, partial, level, start, stop, clear };
}
