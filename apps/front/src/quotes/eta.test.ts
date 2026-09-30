import { describe, expect, it } from "vitest";
import type { Clip } from "../api/types";
import { formatRemaining, lastReadyAt, pendingPassiveMinutes } from "./eta";

const now = new Date("2026-10-02T14:00:00.000Z");
const inMinutes = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();

const clip = (overrides: Partial<Clip>): Clip => ({
  id: crypto.randomUUID(),
  clientClipId: null,
  kind: "dictation",
  status: "pending",
  statusLabel: "En attente",
  durationMs: 10_000,
  transcript: null,
  warnings: [],
  error: null,
  lineCount: 0,
  estimatedReadyAt: null,
  recordedAt: now.toISOString(),
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  ...overrides,
});

describe("formatRemaining", () => {
  it("arrondit à la minute supérieure, en minutes puis en heures", () => {
    expect(formatRemaining(inMinutes(0.3), now)).toBe("moins d'une minute");
    expect(formatRemaining(inMinutes(3.2), now)).toBe("~4 min");
    expect(formatRemaining(inMinutes(65), now)).toBe("~1 h 05");
  });

  it("n'affiche jamais de durée négative pour une estimation dépassée", () => {
    expect(formatRemaining(inMinutes(-2), now)).toBe("moins d'une minute");
  });
});

describe("lastReadyAt", () => {
  it("prend la fin estimée la plus tardive, en ignorant les dictées terminées", () => {
    const clips = [
      clip({ estimatedReadyAt: inMinutes(2) }),
      clip({ estimatedReadyAt: inMinutes(12) }),
      clip({ status: "done", estimatedReadyAt: null }),
    ];
    expect(lastReadyAt(clips)).toBe(inMinutes(12));
    expect(lastReadyAt([clip({ status: "done" })])).toBeNull();
  });
});

describe("pendingPassiveMinutes", () => {
  it("compte les minutes d'écoute passive encore à traiter, pas les dictées", () => {
    const clips = [
      clip({ kind: "passive", durationMs: 270_000, estimatedReadyAt: inMinutes(5) }),
      clip({ kind: "passive", durationMs: 270_000, estimatedReadyAt: inMinutes(10) }),
      clip({ kind: "passive", durationMs: 270_000, status: "done" }),
      clip({ kind: "dictation", durationMs: 60_000, estimatedReadyAt: inMinutes(11) }),
    ];
    expect(pendingPassiveMinutes(clips)).toBe(9);
  });
});
