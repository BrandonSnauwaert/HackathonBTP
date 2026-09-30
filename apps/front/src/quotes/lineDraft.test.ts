import { describe, expect, it } from "vitest";
import { quoteLine } from "../test/fixtures";
import { buildLineUpdate, type LineDraft } from "./lineDraft";

const line = quoteLine({ description: "Pose d'une porte", room: "Cuisine", quantity: 2, unitPriceCents: 12_050 });
const unchanged: LineDraft = {
  description: "Pose d'une porte",
  room: "Cuisine",
  unit: "u",
  quantity: "2",
  price: "120,50",
  vatRateBp: 1000,
};

describe("buildLineUpdate", () => {
  it("ne renvoie rien quand rien n'a changé", () => {
    expect(buildLineUpdate(line, unchanged)).toEqual({ ok: true, update: {} });
  });

  it("ignore les espaces autour du texte et le format des nombres", () => {
    const draft = { ...unchanged, description: "  Pose d'une porte ", quantity: " 2,0 ", price: "120.5" };
    expect(buildLineUpdate(line, draft)).toEqual({ ok: true, update: {} });
  });

  it("regroupe tous les champs modifiés dans une seule mise à jour", () => {
    const draft: LineDraft = {
      description: "Porte de cuisine",
      room: "Entrée",
      unit: "forfait",
      quantity: "1,5",
      price: "1 200",
      vatRateBp: 2000,
    };
    expect(buildLineUpdate(line, draft)).toEqual({
      ok: true,
      update: {
        description: "Porte de cuisine",
        room: "Entrée",
        unit: "forfait",
        quantity: 1.5,
        unitPriceCents: 120_000,
        vatRateBp: 2000,
      },
    });
  });

  it("un prix vidé redevient « à renseigner »", () => {
    expect(buildLineUpdate(line, { ...unchanged, price: "" })).toEqual({ ok: true, update: { unitPriceCents: null } });
  });

  it("refuse une désignation vide, une quantité ou un prix invalides", () => {
    expect(buildLineUpdate(line, { ...unchanged, description: "  " }).ok).toBe(false);
    expect(buildLineUpdate(line, { ...unchanged, quantity: "" }).ok).toBe(false);
    expect(buildLineUpdate(line, { ...unchanged, quantity: "0" }).ok).toBe(false);
    expect(buildLineUpdate(line, { ...unchanged, quantity: "deux" }).ok).toBe(false);
    expect(buildLineUpdate(line, { ...unchanged, price: "-3" }).ok).toBe(false);
  });
});
