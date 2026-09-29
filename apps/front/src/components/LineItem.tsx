import { useState } from "react";
import type { QuoteLine } from "../api/types";
import { centsToInput, formatCents, formatQuantity, formatVat, parseEuros } from "../format";
import { needsReview } from "../quotes/status";
import { Badge } from "./Badge";

const VAT_RATES = [2000, 1000, 550, 0];

export interface LineUpdate {
  quantity?: number;
  unitPriceCents?: number | null;
  vatRateBp?: number;
}

/**
 * Ligne de devis : carte sur téléphone, ligne de tableau sur ordinateur.
 * Un appui ouvre l'édition (quantité, prix, TVA) ; une ligne sans prix est ouverte d'office.
 */
export function LineItem(props: {
  line: QuoteLine;
  editable: boolean;
  vatExempt: boolean;
  onUpdate: (update: LineUpdate) => void;
  onDelete: () => void;
}) {
  const { line, editable } = props;
  const review = needsReview(line);
  const [open, setOpen] = useState(review && editable);
  const [price, setPrice] = useState(centsToInput(line.unitPriceCents));
  const [quantity, setQuantity] = useState(formatQuantity(line.quantity));

  const commitPrice = () => {
    const cents = parseEuros(price);
    if (cents === undefined) return setPrice(centsToInput(line.unitPriceCents));
    if (cents !== line.unitPriceCents) props.onUpdate({ unitPriceCents: cents });
  };

  const commitQuantity = () => {
    const value = Number(quantity.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return setQuantity(formatQuantity(line.quantity));
    if (value !== line.quantity) props.onUpdate({ quantity: value });
  };

  const badge = review ? (
    <Badge tone="w">! prix à renseigner</Badge>
  ) : line.source === "dictation" ? (
    <Badge tone="ok">✓ détecté</Badge>
  ) : (
    <Badge tone="bl">saisi à la main</Badge>
  );

  return (
    <div className={`line ${review ? "w" : ""} ${open ? "open" : ""}`}>
      <button
        type="button"
        className="line-main"
        onClick={() => editable && setOpen((o) => !o)}
        aria-expanded={open}
        disabled={!editable}
      >
        <span className="l-desc b">{line.description}</span>
        <span className="l-qty">
          {formatQuantity(line.quantity)} {line.unitLabel}
        </span>
        <span className="l-pu r">{line.unitPriceCents === null ? "—" : centsToInput(line.unitPriceCents)}</span>
        <span className="l-total r b">{line.totalHtCents === null ? "—" : formatCents(line.totalHtCents)}</span>
        <span className="l-meta mut">
          {formatQuantity(line.quantity)} {line.unitLabel} ×{" "}
          {line.unitPriceCents === null ? "?" : centsToInput(line.unitPriceCents)}
        </span>
        <span className="l-badge">{badge}</span>
      </button>

      {open && editable && (
        <div className="line-edit">
          <label className="field">
            <span>Quantité ({line.unitLabel})</span>
            <input
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onBlur={commitQuantity}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </label>
          <label className="field">
            <span>Prix unitaire HT (€)</span>
            <input
              inputMode="decimal"
              value={price}
              placeholder="à renseigner"
              autoFocus={review}
              onChange={(e) => setPrice(e.target.value)}
              onBlur={commitPrice}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </label>
          {!props.vatExempt && (
            <div className="field">
              <span>TVA</span>
              <div className="seg">
                {VAT_RATES.map((bp) => (
                  <button
                    key={bp}
                    type="button"
                    className={bp === line.vatRateBp ? "on" : ""}
                    onClick={() => bp !== line.vatRateBp && props.onUpdate({ vatRateBp: bp })}
                  >
                    {formatVat(bp)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button type="button" className="btn ghost danger" onClick={props.onDelete}>
            Supprimer la ligne
          </button>
        </div>
      )}
    </div>
  );
}
