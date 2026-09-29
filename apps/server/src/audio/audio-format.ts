/**
 * Format audio attendu dans les messages binaires envoyés par le client :
 * PCM signé 16 bits little-endian, mono, 24 kHz.
 *
 * 24 kHz est la fréquence native de Kyutai (pas de rééchantillonnage côté serveur),
 * et Deepgram l'accepte aussi (encoding=linear16&sample_rate=24000).
 * Côté navigateur : `new AudioContext({ sampleRate: 24000 })` + un AudioWorklet
 * qui convertit les Float32 en Int16.
 */
export const INPUT_SAMPLE_RATE = 24_000;
export const BYTES_PER_SAMPLE = 2;
/** Trame de 80 ms : unité de traitement de Kyutai, et taille des blocs envoyés par le front. */
export const FRAME_SAMPLES = 1920;

/** Convertit du PCM s16le en échantillons flottants dans [-1, 1]. */
export function pcm16ToFloat32(chunk: Buffer): Float32Array {
  const sampleCount = Math.floor(chunk.length / BYTES_PER_SAMPLE);
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = chunk.readInt16LE(i * BYTES_PER_SAMPLE) / 32768;
  }
  return samples;
}
