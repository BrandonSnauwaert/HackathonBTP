import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { QuoteDetail, Unit } from "../api/types";
import { centsToInput, formatVat, parseEuros } from "../format";
import { UNIT_OPTIONS, VAT_RATES, isVatRate, type VatRate } from "../quotes/units";

/**
 * Ajout d'une ligne au clavier : un oubli de la dictée, ou ce que le LLM a mal compris.
 * `labor` : ligne de main d'œuvre pré-remplie (en heures, au taux horaire de l'artisan).
 */
export function NewLineSheet(props: {
  quote: QuoteDetail;
  rooms: string[];
  /** Taux horaire HT de l'artisan : prix proposé dès que l'unité passe en heures. */
  hourlyRateCents: number | null;
  labor?: boolean;
  onClose: () => void;
  run: (action: () => Promise<QuoteDetail>) => Promise<boolean>;
}) {
  const { quote, rooms, hourlyRateCents, labor = false, onClose, run } = props;
  const rateInput = hourlyRateCents === null ? "" : centsToInput(hourlyRateCents);
  const vatExempt = quote.totals.vatExempt;
  const lastVat = quote.lines.at(-1)?.vatRateBp;
  const [description, setDescription] = useState(labor ? "Main d'œuvre" : "");
  const [room, setRoom] = useState(rooms.at(-1) ?? "");
  const [quantity, setQuantity] = useState(labor ? "" : "1");
  const [unit, setUnit] = useState<Unit>(labor ? "h" : "u");
  const [price, setPrice] = useState(labor ? rateInput : "");
  // Même taux que la ligne précédente : souvent le même pour tout le chantier.
  const [vat, setVat] = useState<VatRate>(lastVat !== undefined && isVatRate(lastVat) ? lastVat : 1000);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const qty = Number(quantity.replace(/\s/g, "").replace(",", "."));
    const cents = parseEuros(price);
    if (!Number.isFinite(qty) || qty <= 0) return setError("La quantité doit être un nombre positif.");
    if (cents === undefined) return setError("Prix invalide : par exemple 45 ou 45,50.");
    setError(null);
    setBusy(true);
    const ok = await run(() =>
      api.addLine(quote.id, {
        description: description.trim(),
        room: room.trim(),
        quantity: qty,
        unit,
        unitPriceCents: cents,
        vatRateBp: vatExempt ? 0 : vat,
      }),
    );
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void submit(e)}>
        <div className="row">
          <h2 className="h2">{labor ? "Main d'œuvre" : "Nouvelle ligne"}</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            Annuler
          </button>
        </div>
        <label className="field">
          <span>Désignation *</span>
          <textarea
            required
            autoFocus={!labor}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Pose d'une porte intérieure"
          />
        </label>
        <label className="field">
          <span>Pièce</span>
          <input list="rooms" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Cuisine" />
          <datalist id="rooms">
            {rooms.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </label>
        <div className="field-row">
          <label className="field">
            <span>{unit === "h" ? "Nombre d'heures *" : "Quantité *"}</span>
            <input
              required
              autoFocus={labor}
              inputMode="decimal"
              placeholder={unit === "h" ? "6" : ""}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Unité</span>
            <select
              value={unit}
              onChange={(e) => {
                const next = e.target.value as Unit;
                setUnit(next);
                // En heures, le taux horaire se propose tout seul (sans écraser un prix saisi).
                if (next === "h" && price.trim() === "") setPrice(rateInput);
              }}
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Prix unitaire HT (€)</span>
          <input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="à renseigner"
          />
        </label>
        {!vatExempt && (
          <div className="field">
            <span>TVA</span>
            <div className="seg">
              {VAT_RATES.map((bp) => (
                <button key={bp} type="button" className={bp === vat ? "on" : ""} onClick={() => setVat(bp)}>
                  {formatVat(bp)}
                </button>
              ))}
            </div>
          </div>
        )}
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn pri" disabled={busy || description.trim() === ""}>
          {busy ? "Ajout…" : "Ajouter la ligne"}
        </button>
      </form>
    </div>
  );
}
