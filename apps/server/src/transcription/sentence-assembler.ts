import type { TranscriptEvent } from "./transcriber.js";

/** Un mot qui termine une phrase (Kyutai produit la ponctuation). */
const SENTENCE_END = /[.?!…]["»)]?$/;

/**
 * Silence dans le flux de texte (en steps de 80 ms) avant de clore une phrase après une pause.
 * Le VAD de Kyutai annonce la pause pendant que le dernier mot est encore prononcé : son texte
 * arrive jusqu'à ~7 steps plus tard (mesuré). Entre deux mots d'une même phrase, l'écart
 * observé va jusqu'à ~11 steps : 12 steps (~1 s) laisse passer les deux.
 */
export const QUIET_STEPS = 12;

export interface SentenceAssemblerOptions {
  /** Probabilité de pause au-delà de laquelle le VAD est considéré comme ayant détecté une pause. */
  pauseThreshold: number;
  emit: (event: TranscriptEvent) => void;
}

/**
 * Reconstitue des phrases à partir des mots émis un par un par Kyutai.
 * - chaque mot émet la phrase en cours (isFinal = false) ;
 * - une phrase est close (isFinal = true) sur une ponctuation finale, ou quand le VAD a
 *   détecté une pause ET qu'aucun mot n'est arrivé depuis QUIET_STEPS steps.
 */
export class SentenceAssembler {
  private words: string[] = [];
  private currentStep: number | null = null;
  private lastWordStep: number | null = null;
  private pauseDetected = false;

  constructor(private readonly options: SentenceAssemblerOptions) {}

  onWord(text: string): void {
    this.words.push(text);
    this.lastWordStep = this.currentStep;
    if (SENTENCE_END.test(text)) {
      this.flush();
    } else {
      this.options.emit({ text: this.words.join(" "), isFinal: false });
    }
  }

  /** `stepIdx` : compteur de Kyutai (global au serveur, seul l'écart compte) ; `pause` : probabilité du VAD. */
  onStep(stepIdx: number, pause: number): void {
    this.currentStep = stepIdx;
    if (this.words.length === 0) return;
    if (pause > this.options.pauseThreshold) this.pauseDetected = true;
    const quietFor = this.lastWordStep === null ? Infinity : stepIdx - this.lastWordStep;
    if (this.pauseDetected && quietFor >= QUIET_STEPS) this.flush();
  }

  /** Émet la phrase en cours comme définitive (fin de flux, ou phrase terminée). */
  flush(): void {
    this.pauseDetected = false;
    if (this.words.length === 0) return;
    const text = this.words.join(" ");
    this.words = [];
    this.options.emit({ text, isFinal: true });
  }
}
