import { INPUT_SAMPLE_RATE } from "./audio-format.js";

export class InvalidAudioError extends Error {}

export interface DecodedAudio {
  sampleRate: number;
  /** Mono, échantillons flottants dans [-1, 1]. */
  samples: Float32Array;
}

const FORMAT_PCM = 1;
const FORMAT_FLOAT = 3;
const FORMAT_EXTENSIBLE = 0xfffe;

/**
 * Décode un WAV PCM 16 bits ou flottant 32 bits (mono ou multicanal, downmixé en mono).
 * Ce sont les formats produits par les navigateurs et les outils courants.
 */
export function decodeWav(buf: Buffer): DecodedAudio {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new InvalidAudioError("Fichier WAV attendu");
  }

  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let data: Buffer | undefined;

  for (let offset = 12; offset + 8 <= buf.length;) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      format = buf.readUInt16LE(body);
      channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4);
      bitsPerSample = buf.readUInt16LE(body + 14);
      // WAVE_FORMAT_EXTENSIBLE : le vrai format est dans les 2 premiers octets du sous-format.
      if (format === FORMAT_EXTENSIBLE && size >= 26) format = buf.readUInt16LE(body + 24);
    } else if (id === "data") {
      // Certains enregistreurs en streaming écrivent une taille 0 ou fausse : on prend jusqu'à la fin.
      const end = size === 0 || body + size > buf.length ? buf.length : body + size;
      data = buf.subarray(body, end);
    }
    offset = body + size + (size % 2);
  }

  if (!data || channels === 0 || sampleRate === 0) throw new InvalidAudioError("WAV incomplet (fmt ou data manquant)");
  const isPcm16 = format === FORMAT_PCM && bitsPerSample === 16;
  const isFloat32 = format === FORMAT_FLOAT && bitsPerSample === 32;
  if (!isPcm16 && !isFloat32) {
    throw new InvalidAudioError("Format WAV non supporté : PCM 16 bits ou flottant 32 bits attendu");
  }

  const bytesPerSample = bitsPerSample / 8;
  const frameCount = Math.floor(data.length / (bytesPerSample * channels));
  const samples = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame++) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel++) {
      const at = (frame * channels + channel) * bytesPerSample;
      sum += isPcm16 ? data.readInt16LE(at) / 32768 : data.readFloatLE(at);
    }
    samples[frame] = sum / channels;
  }
  return { sampleRate, samples };
}

/** Rééchantillonnage linéaire (suffisant pour de la voix). */
export function resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return samples;
  const outLength = Math.floor((samples.length * toRate) / fromRate);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const position = (i * fromRate) / toRate;
    const i0 = Math.floor(position);
    const a = samples[i0] ?? 0;
    const b = samples[i0 + 1] ?? a;
    out[i] = a + (b - a) * (position - i0);
  }
  return out;
}

/** Flottants [-1, 1] vers PCM s16le (même échelle que le décodage : ×32768, borné). */
export function floatToPcm16(samples: Float32Array): Buffer {
  const out = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.round((samples[i] ?? 0) * 32768);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, value)), i * 2);
  }
  return out;
}

/** Enveloppe du PCM s16le mono dans un en-tête WAV. */
export function encodeWav(pcm16: Buffer, sampleRate = INPUT_SAMPLE_RATE): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm16.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(FORMAT_PCM, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm16.length, 40);
  return Buffer.concat([header, pcm16]);
}

/** WAV quelconque vers le format interne : PCM s16le mono 24 kHz. */
export function wavToPcm16(buf: Buffer, targetRate = INPUT_SAMPLE_RATE): Buffer {
  const { sampleRate, samples } = decodeWav(buf);
  return floatToPcm16(resample(samples, sampleRate, targetRate));
}

export function pcm16DurationMs(pcm16: Buffer, sampleRate = INPUT_SAMPLE_RATE): number {
  return Math.round((pcm16.length / 2 / sampleRate) * 1000);
}
