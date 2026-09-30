import { useState, type KeyboardEvent } from "react";
import type { LineUpdate, QuoteLine, Unit } from "../api/types";
import { centsToInput, formatCents, formatQuantity, formatVat } from "../format";
import { buildLineUpdate } from "../quotes/lineDraft";
import { needsReview } from "../quotes/status";
import { isVatRate, UNIT_OPTIONS, VAT_RATES, type VatRate } from "../quotes/units";
import { Badge } from "./Badge";

/**
 * Ligne de devis : carte sur téléphone, ligne de tableau sur ordinateur.
 * Un appui ouvre l'édition (désignation, pièce, quantité, unité, prix, TVA) ; une ligne sans prix est ouverte d'office.
 * Les changements restent sur le téléphone jusqu'à « Enregistrer », qui les envoie en une seule requête.
 */
export function LineItem(props: {
  line: QuoteLine;
  editable: boolean;
  vatExempt: boolean;
  /** Résout à true si l'enregistrement a réussi (la ligne est alors remontée avec les nouvelles valeurs). */
  onUpdate: (update: LineUpdate) => Promise<boolean>;
  onDelete: () => void;
}) {
  const { line, editable } = props;
  const review = needsReview(line);
  const [open, setOpen] = useState(review && editable);
  const [description, setDescription] = useState(line.description);
  const [room, setRoom] = useState(line.room);
  const [unit, setUnit] = useState<Unit>(line.unit);
  const [quantity, setQuantity] = useState(formatQuantity(line.quantity));
  const [price, setPrice] = useState(centsToInput(line.unitPriceCents));
  const savedVat: VatRate = isVatRate(line.vatRateBp) ? line.vatRateBp : 2000;
  const [vatRateBp, setVatRateBp] = useState(savedVat);
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState<string | null>(null);

  const draft = buildLineUpdate(line, { description, room, unit, quantity, price, vatRateBp });
  const dirty = draft.ok && Object.keys(draft.update).length > 0;
  const changed = !draft.ok || dirty;
  const unitLabel = unit === line.unit ? line.unitLabel : (UNIT_OPTIONS.find((u) => u.value === unit)?.label ?? unit);

  const reset = () => {
    setDescription(line.description);
    setRoom(line.room);
    setUnit(line.unit);
    setQuantity(formatQuantity(line.quantity));
    setPrice(centsToInput(line.unitPriceCents));
    setVatRateBp(savedVat);
    setInvalid(null);
  };

  const save = async () => {
    if (!draft.ok) return setInvalid(draft.error);
    if (!dirty || saving) return;
    setInvalid(null);
    setSaving(true);
    // En cas de succès, la ligne est remontée (nouvelle clé) : pas d'état à remettre.
    if (!(await props.onUpdate(draft.update))) setSaving(false);
  };

  const submitOnEnter = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    }
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
        // Une ligne modifiée ne se referme pas : il faut enregistrer ou annuler.
        onClick={() => editable && !(open && changed) && setOpen((o) => !o)}
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
          <label className="field wide">
            <span>Désignation</span>
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="field">
            <span>Pièce</span>
            <input
              value={room}
              placeholder="Général"
              onChange={(e) => setRoom(e.target.value)}
              onKeyDown={submitOnEnter}
            />
          </label>
          <label className="field">
            <span>Unité</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {UNIT_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Quantité ({unitLabel})</span>
            <input
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onKeyDown={submitOnEnter}
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
              onKeyDown={submitOnEnter}
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
                    className={bp === vatRateBp ? "on" : ""}
                    onClick={() => setVatRateBp(bp)}
                  >
                    {formatVat(bp)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {invalid && <p className="error-text">{invalid}</p>}
          <div className="btns line-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                reset();
                if (!review) setOpen(false);
              }}
              disabled={saving}
            >
              {changed ? "Annuler" : "Fermer"}
            </button>
            <button
              type="button"
              className={`btn ${dirty ? "pri" : "dis"}`}
              onClick={() => void save()}
              disabled={!changed || saving}
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
          <button type="button" className="btn ghost danger" onClick={props.onDelete} disabled={saving}>
            Supprimer la ligne
          </button>
        </div>
      )}
    </div>
  );
}
