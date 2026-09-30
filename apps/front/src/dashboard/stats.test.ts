import { describe, expect, it } from "vitest";
import { quoteSummary } from "../test/fixtures";
import { dashboardStats, formatDays, formatRate } from "./stats";

const now = new Date("2026-10-02T12:00:00");
const sentOn = (day: string) => `${day}T09:00:00.000Z`;

const quotes = [
  quoteSummary({ status: "draft", totalHtCents: 99_999 }), // pas envoyé : ignoré
  quoteSummary({ status: "sent", sentAt: sentOn("2026-09-28") }),
  quoteSummary({ status: "viewed", sentAt: sentOn("2026-09-20"), viewedAt: sentOn("2026-09-21") }),
  quoteSummary({
    status: "accepted",
    sentAt: sentOn("2026-09-01"),
    viewedAt: sentOn("2026-09-01"),
    respondedAt: sentOn("2026-09-03"), // 2 jours
    totalHtCents: 300_000,
  }),
  quoteSummary({
    status: "accepted",
    sentAt: sentOn("2026-08-10"),
    viewedAt: null, // accord noté à l'oral : compte comme consulté
    respondedAt: sentOn("2026-08-11"), // 1 jour
    totalHtCents: 100_000,
  }),
  quoteSummary({
    status: "declined",
    sentAt: sentOn("2026-07-01"),
    viewedAt: sentOn("2026-07-02"),
    respondedAt: sentOn("2026-07-04"), // 3 jours
    totalHtCents: 50_000,
  }),
];

describe("dashboardStats", () => {
  const stats = dashboardStats(quotes, now);

  it("entonnoir : envoyés, consultés, acceptés (brouillons exclus)", () => {
    expect(stats.funnel).toEqual({ sent: 5, viewed: 4, accepted: 2 });
  });

  it("taux de signature et de consultation rapportés aux devis envoyés", () => {
    expect(stats.signatureRate).toBeCloseTo(2 / 5);
    expect(stats.viewRate).toBeCloseTo(4 / 5);
    expect(stats.acceptedHtCents).toBe(400_000);
  });

  it("délai moyen de réponse du client, acceptations et refus confondus", () => {
    expect(stats.avgResponseDays).toBeCloseTo(2);
  });

  it("chiffre signé par mois sur 6 mois, jusqu'au mois courant", () => {
    expect(stats.months.map((m) => m.key)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(stats.months.find((m) => m.key === "2026-09")).toMatchObject({ acceptedHtCents: 300_000, count: 1 });
    expect(stats.months.find((m) => m.key === "2026-08")).toMatchObject({ acceptedHtCents: 100_000, count: 1 });
    expect(stats.months.find((m) => m.key === "2026-07")?.acceptedHtCents).toBe(0);
  });

  it("sans devis envoyé : pas de taux ni de délai (pas de division par zéro)", () => {
    const empty = dashboardStats([quoteSummary()], now);
    expect(empty).toMatchObject({ signatureRate: null, viewRate: null, avgResponseDays: null, acceptedHtCents: 0 });
    expect(empty.months).toHaveLength(6);
  });
});

describe("formats", () => {
  it("taux et délais lisibles", () => {
    expect(formatRate(0.4)).toBe("40 %");
    expect(formatRate(null)).toBe("—");
    expect(formatDays(0.3)).toBe("moins d'un jour");
    expect(formatDays(1.2)).toBe("1 jour");
    expect(formatDays(2.3)).toBe("2,5 jours");
    expect(formatDays(null)).toBe("—");
  });
});
