import { describe, expect, it } from "vitest";
import { client, quoteSummary } from "../test/fixtures";
import { clientStats, normalize, oneLine, searchClients, suggestClients } from "./clients";

const lefevre = client({ id: "c1", name: "M. et Mme Lefèvre", email: "lefevre@example.com", phone: "06 55 44 33 22" });
const durand = client({ id: "c2", name: "Mme Durand", email: "s.durand@example.com", address: "12 rue des Tilleuls" });

describe("normalize", () => {
  it("ignore les accents, la casse et les espaces autour", () => {
    expect(normalize("  M. Lefèvre ")).toBe("m. lefevre");
    expect(normalize("ÉLODIE")).toBe("elodie");
  });
});

describe("searchClients", () => {
  it("cherche dans le nom, l'e-mail, le téléphone et l'adresse, sans accents", () => {
    expect(searchClients([lefevre, durand], "lefevre")).toEqual([lefevre]);
    expect(searchClients([lefevre, durand], "tilleuls")).toEqual([durand]);
    expect(searchClients([lefevre, durand], "06 55")).toEqual([lefevre]);
  });

  it("renvoie tous les clients pour une recherche vide", () => {
    expect(searchClients([lefevre, durand], "  ")).toEqual([lefevre, durand]);
  });
});

describe("suggestClients", () => {
  it("propose dès la première lettre, sur le nom ou l'e-mail", () => {
    expect(suggestClients([lefevre, durand], "LEF")).toEqual([lefevre]);
    expect(suggestClients([lefevre, durand], "s.dur")).toEqual([durand]);
  });

  it("ne propose rien sans saisie", () => {
    expect(suggestClients([lefevre, durand], "")).toEqual([]);
  });

  it("limite à 5 suggestions", () => {
    const many = Array.from({ length: 8 }, (_, i) => client({ id: `c${i}`, name: `Martin ${i}` }));
    expect(suggestClients(many, "martin")).toHaveLength(5);
  });
});

describe("oneLine", () => {
  it("met une adresse sur une ligne, séparée par des virgules", () => {
    expect(oneLine("3 impasse des Lilas\n69300 Caluire")).toBe("3 impasse des Lilas, 69300 Caluire");
    expect(oneLine("  3 impasse des Lilas \r\n\n 69300 Caluire ")).toBe("3 impasse des Lilas, 69300 Caluire");
    expect(oneLine("")).toBe("");
  });
});

describe("clientStats", () => {
  const quotes = [
    quoteSummary({ number: "a", client: { id: "c1", name: "" }, status: "accepted", totalHtCents: 100_000 }),
    quoteSummary({ number: "b", client: { id: "c1", name: "" }, status: "accepted", totalHtCents: 50_000 }),
    quoteSummary({
      number: "c",
      client: { id: "c1", name: "" },
      status: "viewed",
      updatedAt: "2026-09-28T08:00:00.000Z",
    }),
    quoteSummary({ number: "d", client: { id: "c1", name: "" }, status: "declined", totalHtCents: 999 }),
    quoteSummary({ number: "autre", client: { id: "c2", name: "" }, status: "accepted", totalHtCents: 7 }),
  ];

  it("compte ses devis, ceux en attente et le HT accepté, sans ceux des autres clients", () => {
    const stats = clientStats(lefevre, quotes);
    expect(stats.quotes).toHaveLength(4);
    expect(stats.acceptedHtCents).toBe(150_000);
    expect(stats.waiting).toBe(1);
  });

  it("classe ses devis par dernière activité et en déduit la sienne", () => {
    const stats = clientStats(lefevre, quotes);
    expect(stats.quotes[0]?.number).toBe("c");
    expect(stats.lastActivity).toBe("2026-09-28T08:00:00.000Z");
  });

  it("prend la date de la fiche pour un client sans devis", () => {
    const stats = clientStats(client({ id: "c9", updatedAt: "2026-07-01T00:00:00.000Z" }), quotes);
    expect(stats).toMatchObject({
      quotes: [],
      acceptedHtCents: 0,
      waiting: 0,
      lastActivity: "2026-07-01T00:00:00.000Z",
    });
  });
});
