import { decode, encode } from "@msgpack/msgpack";
import WebSocket, { type RawData } from "ws";
import { z } from "zod";
import { BYTES_PER_SAMPLE, INPUT_SAMPLE_RATE, pcm16ToFloat32 } from "./audio-format.js";
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

/** Un mot qui termine une phrase (Kyutai produit la ponctuation). */
const SENTENCE_END = /[.?!…]["»)]?$/;

/**
 * Retard du texte sur l'audio, en steps de 80 ms : asr_delay_in_tokens = 6 dans
 * la config moshi-server (0,5 s), plus une petite marge.
 */
const TEXT_DELAY_STEPS = 8;

/** Audio mis en attente tant que la connexion à Kyutai n'est pas ouverte (10 s max). */
const MAX_PENDING_BYTES = 10 * INPUT_SAMPLE_RATE * BYTES_PER_SAMPLE;

/**
 * Transcriber branché sur moshi-server (Kyutai STT).
 *
 * Kyutai renvoie les mots un par un, sans notion de segment partiel/définitif.
 * On reconstruit donc des phrases : chaque nouveau mot émet la phrase en cours
 * (isFinal=false). La phrase est émise en définitif (isFinal=true) puis
 * réinitialisée dès qu'un mot se termine par une ponctuation finale, ou quand le
 * VAD sémantique détecte une pause.
 */
export class KyutaiTranscriber implements Transcriber {
  private readonly ws: WebSocket;
  private readonly callbacks: Array<(event: TranscriptEvent) => void> = [];
  private pending: Buffer[] = [];
  private pendingBytes = 0;
  private words: string[] = [];
  /** Step à partir duquel clore la phrase en cours, après une pause détectée. */
  private flushAtStep: number | null = null;
  private closed = false;

  constructor(private readonly options: KyutaiTranscriberOptions) {
    this.ws = new WebSocket(options.url, { headers: { "kyutai-api-key": options.apiKey } });

    this.ws.on("open", () => {
      options.logger.info({ url: options.url }, "connecté à Kyutai STT");
      for (const chunk of this.pending) this.forward(chunk);
      this.pending = [];
      this.pendingBytes = 0;
    });

    this.ws.on("message", (data: RawData) => this.handleMessage(data));

    this.ws.on("error", (err) => {
      options.logger.error({ err, url: options.url }, "erreur de connexion à Kyutai STT");
    });

    this.ws.on("close", (code, reason) => {
      if (!this.closed) {
        options.logger.warn({ code, reason: reason.toString() }, "connexion Kyutai STT fermée");
      }
    });
  }

  sendAudio(chunk: Buffer): void {
    if (this.closed || chunk.length === 0) return;

    if (this.ws.readyState === WebSocket.OPEN) {
      this.forward(chunk);
    } else if (this.ws.readyState === WebSocket.CONNECTING) {
      if (this.pendingBytes + chunk.length > MAX_PENDING_BYTES) return;
      this.pending.push(chunk);
      this.pendingBytes += chunk.length;
    }
  }

  onTranscript(callback: (event: TranscriptEvent) => void): void {
    this.callbacks.push(callback);
  }

  close(): void {
    if (this.closed) return;
    this.flushSentence();
    this.closed = true;
    this.callbacks.length = 0;
    this.pending = [];
    if (this.ws.readyState === WebSocket.CONNECTING) {
      this.ws.terminate();
    } else if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }

  private forward(chunk: Buffer): void {
    const pcm = pcm16ToFloat32(chunk);
    this.ws.send(encode({ type: "Audio", pcm: Array.from(pcm) }, { forceFloat32: true }));
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
        this.words.push(message.text);
        if (SENTENCE_END.test(message.text)) {
          this.flushSentence();
        } else {
          this.emit({ text: this.words.join(" "), isFinal: false });
        }
        break;
      case "Step": {
        if (this.flushAtStep !== null && message.step_idx >= this.flushAtStep) {
          this.flushSentence();
        }
        const pause = message.prs[this.options.pauseHeadIndex] ?? 0;
        if (pause > this.options.pauseThreshold && this.words.length > 0 && this.flushAtStep === null) {
          // Le VAD voit la pause sur l'audio, mais le texte a ~0,5 s de retard :
          // on attend que les derniers mots arrivent avant de clore la phrase.
          this.flushAtStep = message.step_idx + TEXT_DELAY_STEPS;
        }
        break;
      }
      case "Error":
        this.options.logger.error({ message: message.message }, "erreur renvoyée par Kyutai STT");
        break;
      case "EndWord":
      case "Marker":
      case "Ready":
        break;
    }
  }

  private flushSentence(): void {
    this.flushAtStep = null;
    if (this.words.length === 0) return;
    const text = this.words.join(" ");
    this.words = [];
    this.emit({ text, isFinal: true });
  }

  private emit(event: TranscriptEvent): void {
    for (const callback of this.callbacks) callback(event);
  }
}
