import { BYTES_PER_SAMPLE, FRAME_SAMPLES } from "../audio/audio-format.js";
import type { Transcriber } from "./transcriber.js";

/**
 * Transcrit un enregistrement complet (PCM s16le mono 24 kHz) et renvoie le texte.
 * L'audio est envoyé d'un coup, plus vite que le temps réel ; `flush()` attend la fin.
 * Ferme toujours le transcriber.
 */
export async function transcribeAudio(transcriber: Transcriber, pcm16: Buffer): Promise<string> {
  const segments: string[] = [];
  transcriber.onTranscript((event) => {
    if (event.isFinal && event.text.trim()) segments.push(event.text.trim());
  });
  try {
    const chunkBytes = FRAME_SAMPLES * BYTES_PER_SAMPLE;
    for (let offset = 0; offset < pcm16.length; offset += chunkBytes) {
      transcriber.sendAudio(pcm16.subarray(offset, offset + chunkBytes));
    }
    await transcriber.flush();
    return segments.join(" ");
  } finally {
    transcriber.close();
  }
}
