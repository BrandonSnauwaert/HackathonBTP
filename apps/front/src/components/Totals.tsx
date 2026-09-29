import type { QuoteDetail } from "../api/types";
import { formatCents, formatVat } from "../format";

/** Total TTC en grand, puis HT, TVA par taux ; signale des totaux partiels. */
export function Totals({ quote, big = true }: { quote: QuoteDetail; big?: boolean }) {
  const { totals } = quote;
  return (
    <div className="totals">
      {big && (
        <div className="big">
          {formatCents(totals.totalTtcCents)} <small>TTC</small>
        </div>
      )}
      <div className="row sep">
        <span className="mut">Total HT</span>
        <span className="b">{formatCents(totals.totalHtCents)}</span>
      </div>
      {totals.vatBreakdown.map((vat) => (
        <div key={vat.vatRateBp} className="row">
          <span className="mut">TVA {formatVat(vat.vatRateBp)}</span>
          <span className="b">{formatCents(vat.vatCents)}</span>
        </div>
      ))}
      {totals.vatMention && <div className="mut small">{totals.vatMention}</div>}
      {totals.unpricedLineCount > 0 && (
        <div className="small warn-text">
          Totaux partiels : {totals.unpricedLineCount} ligne{totals.unpricedLineCount > 1 ? "s" : ""} sans prix.
        </div>
      )}
    </div>
  );
}
