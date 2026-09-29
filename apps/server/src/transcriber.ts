/**
 * Contrat commun à tous les fournisseurs de transcription
 * (mock, Deepgram, microservice Python Kyutai...).
 */

export interface TranscriptEvent {
  text: string;
  /** false = transcription partielle susceptible d'être corrigée, true = segment définitif */
  isFinal: boolean;
}

export interface Transcriber {
  /** Envoie un morceau d'audio brut reçu du client. */
  sendAudio(chunk: Buffer): void;
  /** Enregistre un callback appelé à chaque résultat de transcription. */
  onTranscript(callback: (event: TranscriptEvent) => void): void;
  /** Libère les ressources (timers, connexions au fournisseur...). */
  close(): void;
}
