import { describe, expect, it } from "vitest";
import { quoteLine, quoteSummary } from "../test/fixtures";
import { activityDate, groupByRoom, isEditable, needsReview, quoteName } from "./status";

describe("groupByRoom", () => {
  it("regroupe les lignes par pièce, dans l'ordre d'apparition, avec leur total HT", () => {
    const groups = groupByRoom([
      quoteLine({ room: "Cuisine", totalHtCents: 1000 }),
      quoteLine({ room: "Salle de bain", totalHtCents: 500 }),
      quoteLine({ room: "Cuisine", totalHtCents: 250 }),
    ]);
    expect(groups.map((g) => [g.room, g.lines.length, g.totalHtCents])).toEqual([
      ["Cuisine", 2, 1250],
      ["Salle de bain", 1, 500],
    ]);
  });

  it("range les lignes sans pièce dans « Général » et ignore les prix manquants dans le total", () => {
    const [group] = groupByRoom([quoteLine({ room: "  " }), quoteLine({ room: "", totalHtCents: null })]);
    expect(group).toMatchObject({ room: "Général", totalHtCents: 10_000 });
  });
});

describe("statuts", () => {
  it("un devis n'est modifiable qu'avant l'envoi", () => {
    expect(isEditable("draft")).toBe(true);
    expect(isEditable("ready")).toBe(true);
    expect(isEditable("sent")).toBe(false);
    expect(isEditable("accepted")).toBe(false);
  });

  it("une ligne sans prix est à vérifier", () => {
    expect(needsReview(quoteLine({ unitPriceCents: null }))).toBe(true);
    expect(needsReview(quoteLine({ unitPriceCents: 0 }))).toBe(false);
  });

  it("dernière activité : date d'envoi d'un devis envoyé, sinon dernière modification", () => {
    const sent = quoteSummary({ status: "sent", sentAt: "2026-09-10T00:00:00.000Z" });
    expect(activityDate(sent)).toBe("2026-09-10T00:00:00.000Z");
    expect(activityDate(quoteSummary({ status: "viewed", sentAt: "2026-09-10T00:00:00.000Z" }))).toBe(
      "2026-09-01T08:00:00.000Z",
    );
  });

  it("nomme un devis par ses travaux et son client", () => {
    expect(quoteName({ title: "Cuisine", client: { name: "Mme Durand" } })).toBe("Cuisine — Mme Durand");
    expect(quoteName({ title: "", client: { name: "Mme Durand" } })).toBe("Mme Durand");
  });
});
