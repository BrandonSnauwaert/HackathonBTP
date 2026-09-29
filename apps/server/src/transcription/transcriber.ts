/**
 * Contrat commun à tous les fournisseurs de transcription
 * (mock, Kyutai, plus tard Deepgram...).
 */

export interface TranscriptEvent {
  text: string;
  /** false = transcription partielle susceptible d'être corrigée, true = segment définitif */
  isFinal: boolean;
}

export interface Transcriber {
  /** Envoie un morceau d'audio : PCM s16le mono 24 kHz (cf. audio/audio-format.ts). */
  sendAudio(chunk: Buffer): void;
  /** Enregistre un callback appelé à chaque résultat de transcription. */
  onTranscript(callback: (event: TranscriptEvent) => void): void;
  /**
   * Signale la fin de l'audio et se résout quand tout ce qui a été envoyé est transcrit :
   * les derniers segments ont alors été émis en isFinal=true. Sert à transcrire un clip complet.
   */
  flush(): Promise<void>;
  /** Libère les ressources (timers, connexions au fournisseur...). */
  close(): void;
}
