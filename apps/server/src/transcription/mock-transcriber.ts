import type { Transcriber, TranscriptEvent } from "./transcriber.js";

const PHRASES: readonly string[] = [
  "il faut changer la porte",
  "prévoir un ragréage dans la cuisine",
  "on remplace le carrelage de la salle de bain",
  "il faudra reprendre l'enduit du couloir",
  "on garde les radiateurs actuels",
  "ajouter deux prises électriques dans le salon",
  "le client veut une peinture blanc cassé dans la chambre",
  "vérifier l'étanchéité de la fenêtre de toit",
];

const EVENT_INTERVAL_MS = 2000;

/**
 * Transcriber factice : dès le premier chunk audio reçu, émet un événement
 * toutes les 2 secondes. Chaque phrase est d'abord émise en partiel
 * (début de phrase, isFinal=false) puis en définitif (phrase complète, isFinal=true),
 * pour imiter le comportement d'un vrai moteur de streaming.
 */
export class MockTranscriber implements Transcriber {
  private readonly callbacks: Array<(event: TranscriptEvent) => void> = [];
  private timer: NodeJS.Timeout | null = null;
  private closed = false;
  private phraseIndex = 0;
  private nextIsFinal = false;

  sendAudio(chunk: Buffer): void {
    if (this.closed || chunk.length === 0 || this.timer !== null) return;
    this.timer = setInterval(() => this.emitNext(), EVENT_INTERVAL_MS);
  }

  onTranscript(callback: (event: TranscriptEvent) => void): void {
    this.callbacks.push(callback);
  }

  /** Émet immédiatement une phrase définitive (si de l'audio a été reçu). */
  async flush(): Promise<void> {
    if (this.closed || this.timer === null) return;
    const text = PHRASES[this.phraseIndex % PHRASES.length] ?? "";
    this.phraseIndex++;
    this.nextIsFinal = false;
    for (const callback of this.callbacks) callback({ text, isFinal: true });
  }

  close(): void {
    this.closed = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.callbacks.length = 0;
  }

  private emitNext(): void {
    const phrase = PHRASES[this.phraseIndex % PHRASES.length] ?? "";
    let event: TranscriptEvent;

    if (this.nextIsFinal) {
      event = { text: phrase, isFinal: true };
      this.phraseIndex++;
    } else {
      const words = phrase.split(" ");
      const partial = words.slice(0, Math.max(1, Math.ceil(words.length / 2))).join(" ");
      event = { text: partial, isFinal: false };
    }
    this.nextIsFinal = !this.nextIsFinal;

    for (const callback of this.callbacks) callback(event);
  }
}
