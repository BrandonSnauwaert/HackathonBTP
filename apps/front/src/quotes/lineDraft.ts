import type { LineUpdate, QuoteLine, Unit } from "../api/types";
import { parseEuros } from "../format";
import type { VatRate } from "./units";

/** Valeurs saisies dans le formulaire d'une ligne, telles que tapées. */
export interface LineDraft {
  description: string;
  room: string;
  unit: Unit;
  quantity: string;
  price: string;
  vatRateBp: VatRate;
}

export type LineDraftResult = { ok: true; update: LineUpdate } | { ok: false; error: string };

/** Champs modifiés par rapport à la ligne enregistrée (vide si rien n'a changé), ou le premier champ invalide. */
export function buildLineUpdate(line: QuoteLine, draft: LineDraft): LineDraftResult {
  const update: LineUpdate = {};

  const description = draft.description.trim();
  if (description === "") return { ok: false, error: "La désignation ne peut pas être vide." };
  if (description !== line.description) update.description = description;

  const room = draft.room.trim();
  if (room !== line.room) update.room = room;

  if (draft.unit !== line.unit) update.unit = draft.unit;

  const quantity = Number(draft.quantity.replace(/\s/g, "").replace(",", "."));
  if (draft.quantity.trim() === "" || !Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: "Quantité invalide." };
  }
  if (quantity !== line.quantity) update.quantity = quantity;

  const cents = parseEuros(draft.price);
  if (cents === undefined) return { ok: false, error: "Prix invalide." };
  if (cents !== line.unitPriceCents) update.unitPriceCents = cents;

  if (draft.vatRateBp !== line.vatRateBp) update.vatRateBp = draft.vatRateBp;

  return { ok: true, update };
}
