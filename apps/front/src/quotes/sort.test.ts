import { describe, expect, it } from "vitest";
import { quoteSummary } from "../test/fixtures";
import { compare, nextSort } from "./sort";

const old = quoteSummary({ number: "old", totalTtcCents: 50_000, updatedAt: "2026-09-01T08:00:00.000Z" });
const recent = quoteSummary({ number: "recent", totalTtcCents: 10_000, updatedAt: "2026-09-20T08:00:00.000Z" });
const followUp = quoteSummary({
  number: "follow_up",
  status: "follow_up",
  totalTtcCents: 20_000,
  updatedAt: "2026-08-15T08:00:00.000Z",
});
const numbers = (list: ReturnType<typeof quoteSummary>[]) => list.map((q) => q.number);

describe("compare", () => {
  const all = [old, recent, followUp];

  it("met les devis à relancer en tête, puis la dernière activité (tri par défaut)", () => {
    expect(numbers([...all].sort(compare("priority")))).toEqual(["follow_up", "recent", "old"]);
  });

  it("trie par montant TTC, dans les deux sens", () => {
    expect(numbers([...all].sort(compare("amount-desc")))).toEqual(["old", "follow_up", "recent"]);
    expect(numbers([...all].sort(compare("amount-asc")))).toEqual(["recent", "follow_up", "old"]);
  });

  it("trie par dernière activité, sans priorité pour les devis à relancer", () => {
    expect(numbers([...all].sort(compare("activity-desc")))).toEqual(["recent", "old", "follow_up"]);
    expect(numbers([...all].sort(compare("activity-asc")))).toEqual(["follow_up", "old", "recent"]);
  });

  it("prend la date d'envoi comme activité d'un devis envoyé", () => {
    const sentLate = quoteSummary({
      number: "sent",
      status: "sent",
      sentAt: "2026-09-25T08:00:00.000Z",
      updatedAt: "2026-08-01T08:00:00.000Z",
    });
    expect(numbers([recent, sentLate].sort(compare("activity-desc")))).toEqual(["sent", "recent"]);
  });

  it("départage deux montants égaux par l'activité la plus récente", () => {
    const sameAmount = quoteSummary({ ...old, number: "same", updatedAt: "2026-09-30T08:00:00.000Z" });
    expect(numbers([old, sameAmount].sort(compare("amount-desc")))).toEqual(["same", "old"]);
  });
});

describe("nextSort", () => {
  it("passe de décroissant à croissant, puis revient au tri par défaut", () => {
    expect(nextSort("priority", "amount")).toBe("amount-desc");
    expect(nextSort("amount-desc", "amount")).toBe("amount-asc");
    expect(nextSort("amount-asc", "amount")).toBe("priority");
  });

  it("repart en décroissant quand on change de colonne", () => {
    expect(nextSort("amount-asc", "activity")).toBe("activity-desc");
  });
});
