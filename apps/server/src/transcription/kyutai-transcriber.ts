import { decode, encode } from "@msgpack/msgpack";
import WebSocket, { type RawData } from "ws";
import { z } from "zod";
import { FRAME_SAMPLES, pcm16ToFloat32 } from "../audio/audio-format.js";
import { SentenceAssembler } from "./sentence-assembler.js";
import type { Transcriber, TranscriptEvent } from "./transcriber.js";

/**
 * Messages renvoyés par moshi-server sur /api/asr-streaming (encodés en msgpack).
 * Cf. OutMsg dans moshi-server/src/asr.rs.
 */
const KyutaiMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Word"), text: z.string(), start_time: z.number() }),
  z.object({ type: z.literal("EndWord"), stop_time: z.number() }),
  z.object({
    type: z.literal("Step"),
    step_idx: z.number(),
    // Probabilités de pause du VAD sémantique, pour des pauses de 0,5 / 1 / 2 / 3 s.
    prs: z.array(z.number()),
    buffered_pcm: z.number(),
  }),
  z.object({ type: z.literal("Marker"), id: z.number() }),
  z.object({ type: z.literal("Error"), message: z.string() }),
  z.object({ type: z.literal("Ready") }),
]);
type KyutaiMessage = z.infer<typeof KyutaiMessageSchema>;

export interface Logger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export interface KyutaiTranscriberOptions {
  /** ex. ws://localhost:8080/api/asr-streaming */
  url: string;
  apiKey: string;
  /** Tête du VAD utilisée pour clore une phrase : 0 = 0,5 s, 1 = 1 s, 2 = 2 s, 3 = 3 s de pause. */
  pauseHeadIndex: number;
  /** Seuil de probabilité de pause au-delà duquel la phrase est considérée finie. */
  pauseThreshold: number;
  logger: Logger;
}

/**
 * Messages mis en attente tant que la connexion à Kyutai n'est pas ouverte.
 * Large, car un clip entier peut être envoyé d'un coup (≈ 5 octets par échantillon en msgpack).
 */
const MAX_QUEUED_BYTES = 64 * 1024 * 1024;

/** Silence envoyé après un marqueur pour faire avancer le modèle jusqu'à lui (trame de 80 ms). */
const SILENCE_FRAME: readonly number[] = new Array<number>(FRAME_SAMPLES).fill(0);
/**
 * Silence ajouté AVANT le marqueur de fin : Kyutai n'émet le dernier mot qu'après avoir « entendu »
 * un peu de silence derrière. Sans lui, un clip qui s'arrête juste après la parole perd son dernier
 * mot (constaté sur de vraies dictées ; le script officiel de Kyutai en envoie aussi). ~1,5 s.
 */
const TRAILING_SILENCE_FRAMES = 19;
/** Cadence d'envoi du silence : 80 ms d'audio toutes les 20 ms, soit 4× le temps réel. */
const SILENCE_INTERVAL_MS = 20;
const FLUSH_TIMEOUT_MS = 60_000;

/**
 * Transcriber branché sur moshi-server (Kyutai STT).
 *
 * Kyutai renvoie les mots un par un, sans notion de segment partiel/définitif :
 * SentenceAssembler reconstitue les phrases (cf. sentence-assembler.ts).
 */
export class KyutaiTranscriber implements Transcriber {
  private readonly ws: WebSocket;
  private readonly callbacks: Array<(event: TranscriptEvent) => void> = [];
  private queue: Uint8Array[] = [];
  private queuedBytes = 0;
  private lastMarkerId = 0;
  /** flush() en attente, par identifiant de marqueur. */
  private readonly markerWaiters = new Map<number, { resolve: () => void; reject: (err: Error) => void }>();
  private readonly sentences: SentenceAssembler;
  private closed = false;

  constructor(private readonly options: KyutaiTranscriberOptions) {
    this.sentences = new SentenceAssembler({
      pauseThreshold: options.pauseThreshold,
      emit: (event) => {
        for (const callback of this.callbacks) callback(event);
      },
    });
    this.ws = new WebSocket(options.url, { headers: { "kyutai-api-key": options.apiKey } });

    this.ws.on("open", () => {
      options.logger.info({ url: options.url }, "connecté à Kyutai STT");
      for (const message of this.queue) this.ws.send(message);
      this.queue = [];
      this.queuedBytes = 0;
    });

    this.ws.on("message", (data: RawData) => this.handleMessage(data));

    this.ws.on("error", (err) => {
      options.logger.error({ err, url: options.url }, "erreur de connexion à Kyutai STT");
      this.rejectWaiters(new Error("Service de transcription Kyutai injoignable"));
    });

    this.ws.on("close", (code, reason) => {
      if (!this.closed) {
        options.logger.warn({ code, reason: reason.toString() }, "connexion Kyutai STT fermée");
      }
      this.rejectWaiters(new Error("Connexion au service de transcription Kyutai fermée"));
    });
  }

  sendAudio(chunk: Buffer): void {
    if (this.closed || chunk.length === 0) return;
    this.send({ type: "Audio", pcm: Array.from(pcm16ToFloat32(chunk)) });
  }

  /**
   * Envoie un marqueur puis du silence jusqu'à ce que Kyutai renvoie ce marqueur :
   * tout l'audio envoyé avant a alors été transcrit (délai du modèle compris).
   */
  flush(): Promise<void> {
    if (this.closed) return Promise.resolve();
    const id = ++this.lastMarkerId;

    return new Promise<void>((resolve, reject) => {
      const silence = setInterval(() => this.send({ type: "Audio", pcm: SILENCE_FRAME }), SILENCE_INTERVAL_MS);
      const timeout = setTimeout(() => {
        this.markerWaiters.delete(id);
        clearInterval(silence);
        reject(new Error("Transcription Kyutai : délai dépassé"));
      }, FLUSH_TIMEOUT_MS);
      const done = () => {
        clearInterval(silence);
        clearTimeout(timeout);
        this.markerWaiters.delete(id);
      };

      this.markerWaiters.set(id, {
        resolve: () => {
          done();
          this.sentences.flush();
          resolve();
        },
        reject: (err) => {
          done();
          reject(err);
        },
      });
      for (let i = 0; i < TRAILING_SILENCE_FRAMES; i++) this.send({ type: "Audio", pcm: SILENCE_FRAME });
      this.send({ type: "Marker", id });
    });
  }

  onTranscript(callback: (event: TranscriptEvent) => void): void {
    this.callbacks.push(callback);
  }

  close(): void {
    if (this.closed) return;
    this.sentences.flush();
    this.closed = true;
    this.callbacks.length = 0;
    this.queue = [];
    this.rejectWaiters(new Error("Transcription interrompue"));
    if (this.ws.readyState === WebSocket.CONNECTING) {
      this.ws.terminate();
    } else if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }

  /** Envoie un message msgpack, ou le met en attente pendant la connexion. */
  private send(message: { type: "Audio"; pcm: readonly number[] } | { type: "Marker"; id: number }): void {
    const data = encode(message, { forceFloat32: true });
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else if (this.ws.readyState === WebSocket.CONNECTING && this.queuedBytes + data.length <= MAX_QUEUED_BYTES) {
      this.queue.push(data);
      this.queuedBytes += data.length;
    }
  }

  private rejectWaiters(err: Error): void {
    for (const waiter of [...this.markerWaiters.values()]) waiter.reject(err);
  }

  private handleMessage(data: RawData): void {
    let message: KyutaiMessage;
    try {
      const raw = Array.isArray(data) ? Buffer.concat(data) : data;
      message = KyutaiMessageSchema.parse(decode(raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw));
    } catch (err) {
      this.options.logger.warn({ err }, "message Kyutai non reconnu");
      return;
    }

    switch (message.type) {
      case "Word":
        this.sentences.onWord(message.text);
        break;
      case "Step":
        this.sentences.onStep(message.step_idx, message.prs[this.options.pauseHeadIndex] ?? 0);
        break;
      case "Error":
        this.options.logger.error({ message: message.message }, "erreur renvoyée par Kyutai STT");
        break;
      case "Marker":
        this.markerWaiters.get(message.id)?.resolve();
        break;
      case "EndWord":
      case "Ready":
        break;
    }
  }
}
