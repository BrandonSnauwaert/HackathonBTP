import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeQuoteTotals, lineTotalHtCents } from "./quote-totals.js";

describe("lineTotalHtCents", () => {
  it("multiplie quantité et prix, arrondi au centime", () => {
    assert.equal(lineTotalHtCents(12.5, 1990), 24875);
    assert.equal(lineTotalHtCents(3, 3333), 9999);
    assert.equal(lineTotalHtCents(0.333, 1000), 333);
    assert.equal(lineTotalHtCents(1.005, 100), 101);
  });
});

describe("computeQuoteTotals", () => {
  it("calcule HT, TVA par taux et TTC", () => {
    const totals = computeQuoteTotals(
      [
        { quantity: 1, unitPriceCents: 45000, vatRateBp: 1000 }, // porte : 450 €, 10 %
        { quantity: 12, unitPriceCents: 2500, vatRateBp: 1000 }, // ragréage : 12 m² × 25 €, 10 %
        { quantity: 2, unitPriceCents: 10000, vatRateBp: 2000 }, // 200 €, 20 %
      ],
      { vatExempt: false },
    );
    assert.deepEqual(totals.lineTotalsHtCents, [45000, 30000, 20000]);
    assert.equal(totals.totalHtCents, 95000);
    assert.deepEqual(totals.vatBreakdown, [
      { vatRateBp: 2000, baseHtCents: 20000, vatCents: 4000 },
      { vatRateBp: 1000, baseHtCents: 75000, vatCents: 7500 },
    ]);
    assert.equal(totals.totalVatCents, 11500);
    assert.equal(totals.totalTtcCents, 106500);
    assert.equal(totals.unpricedLineCount, 0);
  });

  it("arrondit la TVA une fois par taux, pas par ligne", () => {
    // 3 lignes à 0,33 € avec 5,5 % : par ligne on aurait 3 × 2 = 6 cts, sur la base 99 cts → 5 cts
    const totals = computeQuoteTotals(
      Array.from({ length: 3 }, () => ({ quantity: 1, unitPriceCents: 33, vatRateBp: 550 })),
      { vatExempt: false },
    );
    assert.equal(totals.totalVatCents, 5);
    assert.equal(totals.totalTtcCents, 104);
  });

  it("ignore les lignes sans prix et les compte", () => {
    const totals = computeQuoteTotals(
      [
        { quantity: 1, unitPriceCents: 10000, vatRateBp: 2000 },
        { quantity: 5, unitPriceCents: null, vatRateBp: 2000 },
      ],
      { vatExempt: false },
    );
    assert.deepEqual(totals.lineTotalsHtCents, [10000, null]);
    assert.equal(totals.totalHtCents, 10000);
    assert.equal(totals.totalTtcCents, 12000);
    assert.equal(totals.unpricedLineCount, 1);
  });

  it("n'applique aucune TVA en franchise (auto-entrepreneur)", () => {
    const totals = computeQuoteTotals([{ quantity: 2, unitPriceCents: 5000, vatRateBp: 2000 }], { vatExempt: true });
    assert.equal(totals.totalVatCents, 0);
    assert.equal(totals.totalTtcCents, 10000);
    assert.deepEqual(totals.vatBreakdown, [{ vatRateBp: 0, baseHtCents: 10000, vatCents: 0 }]);
  });

  it("gère un devis vide", () => {
    const totals = computeQuoteTotals([], { vatExempt: false });
    assert.equal(totals.totalTtcCents, 0);
    assert.deepEqual(totals.vatBreakdown, []);
  });
});
