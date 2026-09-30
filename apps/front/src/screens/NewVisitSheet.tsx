import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import { errorMessage } from "../quotes/useQuote";
import { navigate } from "../router";

/**
 * Infos du client, saisies au clavier avant la visite (une adresse e-mail dictée, c'est risqué).
 * Crée le devis en brouillon puis ouvre l'écran de visite.
 */
export function NewVisitSheet({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const client = { name: name.trim(), ...(email && { email }), ...(phone && { phone }) };
      const quote = await api.createQuote(client, title.trim(), siteAddress.trim());
      navigate({ name: "visit", id: quote.id });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void submit(e)}>
        <div className="row">
          <h2 className="h2">Nouvelle visite</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            Annuler
          </button>
        </div>
        <label className="field">
          <span>Client *</span>
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Mme Durand" />
        </label>
        <label className="field">
          <span>Adresse du chantier</span>
          <input
            value={siteAddress}
            onChange={(e) => setSiteAddress(e.target.value)}
            placeholder="12 rue des Tilleuls, 69003 Lyon"
            autoComplete="street-address"
          />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Téléphone</span>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          </label>
          <label className="field">
            <span>E-mail</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
        </div>
        <label className="field">
          <span>Travaux</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Salle de bain" />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn pri" disabled={busy}>
          Commencer la visite
        </button>
      </form>
    </div>
  );
}
