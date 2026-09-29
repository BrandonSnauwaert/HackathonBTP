/** Unités de mesure d'une ligne de devis. */
export const UNITS = ["u", "m2", "ml", "m3", "h", "jour", "forfait", "kg", "l", "ens"] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_LABELS: Record<Unit, string> = {
  u: "u",
  m2: "m²",
  ml: "ml",
  m3: "m³",
  h: "h",
  jour: "jour",
  forfait: "forfait",
  kg: "kg",
  l: "L",
  ens: "ensemble",
};
