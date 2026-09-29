import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { InvalidAudioError, decodeWav, encodeWav, floatToPcm16, pcm16DurationMs, resample, wavToPcm16 } from "./wav.js";

function wav(options: { rate: number; channels: number; format: 1 | 3; bits: 16 | 32; frames: number[][] }): Buffer {
  const bytes = options.bits / 8;
  const data = Buffer.alloc(options.frames.length * options.channels * bytes);
  options.frames.forEach((frame, i) =>
    frame.forEach((value, c) => {
      const at = (i * options.channels + c) * bytes;
      if (options.format === 1) data.writeInt16LE(value, at);
      else data.writeFloatLE(value, at);
    }),
  );
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(options.format, 20);
  header.writeUInt16LE(options.channels, 22);
  header.writeUInt32LE(options.rate, 24);
  header.writeUInt32LE(options.rate * options.channels * bytes, 28);
  header.writeUInt16LE(options.channels * bytes, 32);
  header.writeUInt16LE(options.bits, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

describe("decodeWav", () => {
  it("décode du PCM 16 bits stéréo en mono", () => {
    const audio = decodeWav(
      wav({
        rate: 48000,
        channels: 2,
        format: 1,
        bits: 16,
        frames: [
          [16384, 0],
          [-32768, -32768],
        ],
      }),
    );
    assert.equal(audio.sampleRate, 48000);
    assert.deepEqual([...audio.samples], [0.25, -1]);
  });

  it("décode du flottant 32 bits", () => {
    const audio = decodeWav(wav({ rate: 16000, channels: 1, format: 3, bits: 32, frames: [[0.5], [-0.25]] }));
    assert.deepEqual([...audio.samples], [0.5, -0.25]);
  });

  it("refuse ce qui n'est pas un WAV supporté", () => {
    assert.throws(() => decodeWav(Buffer.from("pas du tout un wav")), InvalidAudioError);
    assert.throws(
      () => decodeWav(wav({ rate: 8000, channels: 1, format: 3, bits: 32, frames: [[0]] }).fill(0, 20, 22)),
      InvalidAudioError,
    );
  });

  it("lit l'échantillon de test", () => {
    const pcm = wavToPcm16(readFileSync(new URL("../../samples/chantier-fr.wav", import.meta.url)));
    assert.ok(pcm16DurationMs(pcm) > 15_000);
  });
});

describe("resample / encodeWav", () => {
  it("rééchantillonne en conservant la durée", () => {
    const out = resample(new Float32Array(48000), 48000, 24000);
    assert.equal(out.length, 24000);
  });

  it("fait l'aller-retour PCM 16 bits → WAV → PCM 16 bits", () => {
    const pcm = floatToPcm16(new Float32Array([0, 0.5, -0.5, 1, -1]));
    assert.deepEqual(wavToPcm16(encodeWav(pcm)), pcm);
  });
});
