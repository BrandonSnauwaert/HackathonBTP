/**
 * Calculs d'un devis. Tous les montants sont en centimes entiers.
 * Arrondi au centime sur le total de chaque ligne, puis sur la TVA de chaque taux.
 */

/** Taux de TVA autorisés, en points de base (2000 = 20 %). */
export const VAT_RATES_BP = [2000, 1000, 550, 0] as const;
export type VatRateBp = (typeof VAT_RATES_BP)[number];

export const VAT_RATE_LABELS: Record<VatRateBp, string> = {
  2000: "20 % (taux normal)",
  1000: "10 % (rénovation, logement de plus de 2 ans)",
  550: "5,5 % (rénovation énergétique)",
  0: "0 %",
};

/** Mention obligatoire pour une entreprise en franchise de TVA (auto-entrepreneur). */
export const VAT_EXEMPT_MENTION = "TVA non applicable, art. 293 B du CGI";

export interface LineAmountsInput {
  quantity: number;
  /** null = prix pas encore renseigné */
  unitPriceCents: number | null;
  vatRateBp: number;
}

export interface VatBreakdownEntry {
  vatRateBp: number;
  baseHtCents: number;
  vatCents: number;
}

export interface QuoteTotals {
  /** Total HT de chaque ligne, dans le même ordre (null si prix manquant). */
  lineTotalsHtCents: (number | null)[];
  totalHtCents: number;
  vatBreakdown: VatBreakdownEntry[];
  totalVatCents: number;
  totalTtcCents: number;
  /** Nombre de lignes sans prix : les totaux sont alors partiels. */
  unpricedLineCount: number;
}

/**
 * La quantité passe d'abord en millièmes entiers : `1.005 * 100` vaut 100.4999… en
 * flottant et s'arrondirait à 100 au lieu de 101.
 */
export function lineTotalHtCents(quantity: number, unitPriceCents: number): number {
  const quantityMilli = Math.round(quantity * 1000);
  return Math.round((quantityMilli * unitPriceCents) / 1000);
}

export function computeQuoteTotals(lines: readonly LineAmountsInput[], options: { vatExempt: boolean }): QuoteTotals {
  const baseByRate = new Map<number, number>();
  let totalHtCents = 0;
  let unpricedLineCount = 0;

  const lineTotalsHtCents = lines.map((line) => {
    if (line.unitPriceCents === null) {
      unpricedLineCount++;
      return null;
    }
    const total = lineTotalHtCents(line.quantity, line.unitPriceCents);
    totalHtCents += total;
    const rate = options.vatExempt ? 0 : line.vatRateBp;
    baseByRate.set(rate, (baseByRate.get(rate) ?? 0) + total);
    return total;
  });

  const vatBreakdown = [...baseByRate.entries()]
    .sort(([a], [b]) => b - a)
    .map(([vatRateBp, baseHtCents]) => ({
      vatRateBp,
      baseHtCents,
      vatCents: Math.round((baseHtCents * vatRateBp) / 10_000),
    }));
  const totalVatCents = vatBreakdown.reduce((sum, entry) => sum + entry.vatCents, 0);

  return {
    lineTotalsHtCents,
    totalHtCents,
    vatBreakdown,
    totalVatCents,
    totalTtcCents: totalHtCents + totalVatCents,
    unpricedLineCount,
  };
}
