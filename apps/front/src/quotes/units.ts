import type { Unit } from "../api/types";

/** Unités d'une ligne de devis, dans l'ordre du sélecteur (mêmes codes que le serveur, src/domain/units.ts). */
export const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: "u", label: "u (unité)" },
  { value: "m2", label: "m²" },
  { value: "ml", label: "ml (mètre linéaire)" },
  { value: "m3", label: "m³" },
  { value: "h", label: "h (heure)" },
  { value: "jour", label: "jour" },
  { value: "forfait", label: "forfait" },
  { value: "ens", label: "ensemble" },
  { value: "kg", label: "kg" },
  { value: "l", label: "L (litre)" },
];

export const VAT_RATES = [2000, 1000, 550, 0] as const;
export type VatRate = (typeof VAT_RATES)[number];

export const isVatRate = (bp: number): bp is VatRate => (VAT_RATES as readonly number[]).includes(bp);
