import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateReadyTimes, type ClipEstimateOptions, type UnfinishedClip } from "./clip-estimate.js";

// Chiffres ronds : transcription 1× le temps réel, analyse 10 s + 6 s par minute d'audio.
const options: ClipEstimateOptions = { sttSpeedFactor: 1, llmBaseMs: 10_000, llmMsPerAudioMinute: 6_000 };
const now = new Date("2026-10-02T14:00:00.000Z");
const at = (secondsFromNow: number) => new Date(now.getTime() + secondsFromNow * 1000);
const clip = (overrides: Partial<UnfinishedClip> & Pick<UnfinishedClip, "id">): UnfinishedClip => ({
  quoteId: "q1",
  status: "pending",
  durationMs: 60_000,
  updatedAt: now,
  ...overrides,
});
/** Secondes restantes avant la fin estimée de chaque dictée. */
function remaining(clips: UnfinishedClip[]): Record<string, number> {
  const ready = estimateReadyTimes(clips, now, options);
  return Object.fromEntries([...ready].map(([id, date]) => [id, (date.getTime() - now.getTime()) / 1000]));
}

describe("estimateReadyTimes", () => {
  it("dictée seule en attente : transcription puis analyse", () => {
    // 60 s de transcription + 10 s + 6 s d'analyse
    assert.deepEqual(remaining([clip({ id: "a" })]), { a: 76 });
  });

  it("compte ce qui reste de la transcription en cours, puis enchaîne les dictées en attente", () => {
    const result = remaining([
      clip({ id: "a", status: "transcribing", updatedAt: at(-20) }), // encore 40 s
      clip({ id: "b", quoteId: "q2" }), // attend a : 40 + 60 s
    ]);
    assert.deepEqual(result, { a: 56, b: 116 });
  });

  it("une écoute passive de 20 min prend bien plus longtemps que des dictées courtes", () => {
    const passive = remaining([clip({ id: "p", durationMs: 20 * 60_000 })]);
    const dictations = remaining([
      clip({ id: "d1", durationMs: 10_000 }),
      clip({ id: "d2", durationMs: 10_000 }),
      clip({ id: "d3", durationMs: 10_000 }),
    ]);
    // 1 200 s + 10 s + 120 s, contre moins d'une minute pour trois dictées de 10 s
    assert.equal(passive.p, 1330);
    assert.ok((dictations.d3 ?? Infinity) < 60);
  });

  it("garde l'ordre des analyses d'un même devis, en parallèle entre devis", () => {
    const result = remaining([
      clip({ id: "a1", status: "transcribed", durationMs: 0 }), // analyse : 10 s
      clip({ id: "a2", status: "transcribed", durationMs: 0 }), // après a1 : 20 s
      clip({ id: "b1", quoteId: "q2", status: "transcribed", durationMs: 0 }), // autre devis : 10 s
    ]);
    assert.deepEqual(result, { a1: 10, a2: 20, b1: 10 });
  });

  it("n'annonce jamais une fin dans le passé pour un traitement en retard", () => {
    const result = remaining([
      clip({ id: "slow", status: "transcribing", durationMs: 10_000, updatedAt: at(-120) }),
      clip({ id: "llm", quoteId: "q2", status: "extracting", durationMs: 0, updatedAt: at(-60) }),
    ]);
    assert.ok((result.slow ?? 0) > 5);
    assert.equal(result.llm, 5);
  });

  it("ne renvoie rien sans dictée en cours", () => {
    assert.equal(estimateReadyTimes([], now, options).size, 0);
  });
});
