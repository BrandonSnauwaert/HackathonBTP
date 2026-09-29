import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SentenceAssembler } from "./sentence-assembler.js";
import type { TranscriptEvent } from "./transcriber.js";

type Event = ["step", number, number] | ["word", string];

/** Rejoue une séquence de messages Kyutai et renvoie les phrases définitives. */
function replay(events: Event[]): string[] {
  const finals: string[] = [];
  const assembler = new SentenceAssembler({
    pauseThreshold: 0.5,
    emit: (e: TranscriptEvent) => e.isFinal && finals.push(e.text),
  });
  for (const event of events) {
    if (event[0] === "step") assembler.onStep(event[1], event[2]);
    else assembler.onWord(event[1]);
  }
  return finals;
}

/** Steps consécutifs de `from` à `to` avec la même probabilité de pause. */
const steps = (from: number, to: number, pause: number): Event[] =>
  Array.from({ length: to - from + 1 }, (_, i): Event => ["step", from + i, pause]);

describe("SentenceAssembler", () => {
  it("garde le dernier mot quand le VAD annonce la pause avant lui (séquence réelle)", () => {
    // Relevé sur Kyutai (steps exacts) : « complètement » au step 6544, pause détectée dès 6547,
    // texte du dernier mot « gondolée » seulement au step 6553.
    const finals = replay([
      ...steps(6533, 6536, 0.1),
      ["word", "elle"],
      ["word", "est"],
      ...steps(6537, 6544, 0.1),
      ["word", "complètement"],
      ...steps(6545, 6546, 0.2),
      ...steps(6547, 6553, 0.94),
      ["word", "gondolée"],
      ...steps(6554, 6580, 0.99),
    ]);
    assert.deepEqual(finals, ["elle est complètement gondolée"]);
  });

  it("attend un vrai silence : un mot lent (jusqu'à 11 steps) reste dans la phrase", () => {
    const finals = replay([
      ["step", 100, 0.1],
      ["word", "prévoir"],
      ...steps(101, 111, 0.9),
      ["word", "ragréage"],
      ...steps(112, 130, 0.9),
    ]);
    assert.deepEqual(finals, ["prévoir ragréage"]);
  });

  it("clôt immédiatement sur une ponctuation finale", () => {
    const finals = replay([
      ["step", 1, 0.1],
      ["word", "Bonjour"],
      ["word", "madame."],
      ["word", "Alors"],
    ]);
    assert.deepEqual(finals, ["Bonjour madame."]);
  });

  it("ne clôt pas sans pause détectée, même après un long silence", () => {
    const finals = replay([["step", 1, 0.1], ["word", "donc"], ...steps(2, 60, 0.2)]);
    assert.deepEqual(finals, []);
  });

  it("flush() émet la phrase en cours", () => {
    const finals: string[] = [];
    const assembler = new SentenceAssembler({ pauseThreshold: 0.5, emit: (e) => e.isFinal && finals.push(e.text) });
    assembler.onStep(1, 0);
    assembler.onWord("on");
    assembler.onWord("garde");
    assembler.flush();
    assembler.flush();
    assert.deepEqual(finals, ["on garde"]);
  });
});
