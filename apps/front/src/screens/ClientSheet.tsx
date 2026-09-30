import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { QuoteDetail } from "../api/types";
import { isEditable } from "../quotes/status";
import { errorMessage } from "../quotes/useQuote";

/**
 * Fiche du client et infos du chantier. Le client se modifie à tout moment
 * (une adresse e-mail erronée se corrige, puis on renvoie l'e-mail) ;
 * le chantier et l'objet seulement tant que le devis n'est pas envoyé.
 */
export function ClientSheet(props: { quote: QuoteDetail; onClose: () => void; onSaved: () => Promise<void> }) {
  const { quote, onClose, onSaved } = props;
  const { client } = quote;
  const quoteEditable = isEditable(quote.status);
  const [name, setName] = useState(client.name);
  const [email, setEmail] = useState(client.email);
  const [phone, setPhone] = useState(client.phone);
  const [address, setAddress] = useState(client.address);
  const [siteAddress, setSiteAddress] = useState(quote.siteAddress);
  const [title, setTitle] = useState(quote.title);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const clientUpdate = { name: name.trim(), email: email.trim(), phone: phone.trim(), address: address.trim() };
      const clientChanged = (Object.keys(clientUpdate) as (keyof typeof clientUpdate)[]).some(
        (key) => clientUpdate[key] !== client[key],
      );
      if (clientChanged) await api.updateClient(client.id, clientUpdate);
      if (quoteEditable && (siteAddress.trim() !== quote.siteAddress || title.trim() !== quote.title)) {
        await api.updateQuote(quote.id, { siteAddress: siteAddress.trim(), title: title.trim() });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void submit(e)}>
        <div className="row">
          <h2 className="h2">Client et chantier</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            Annuler
          </button>
        </div>
        <label className="field">
          <span>Client *</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field-row wrap">
          <label className="field">
            <span>E-mail</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </label>
          <label className="field">
            <span>Téléphone</span>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
          </label>
        </div>
        <label className="field">
          <span>Adresse du client</span>
          <textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        {quoteEditable && (
          <>
            <label className="field">
              <span>Adresse du chantier (si différente)</span>
              <input value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />
            </label>
            <label className="field">
              <span>Travaux</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Salle de bain" />
            </label>
          </>
        )}
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn pri" disabled={busy || name.trim() === ""}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>
    </div>
  );
}

/** Résumé du client, avec le bouton qui ouvre sa fiche. */
export function ClientCard({ quote, onEdit }: { quote: QuoteDetail; onEdit: () => void }) {
  const { client } = quote;
  return (
    <div className="card client-card">
      <div className="row">
        <div className="grow">
          <div className="b">{client.name}</div>
          <div className={`small ${client.email ? "mut" : "warn-text"}`}>{client.email || "E-mail manquant"}</div>
          {client.phone && <div className="small mut">{client.phone}</div>}
          {quote.siteAddress && <div className="small mut">Chantier : {quote.siteAddress}</div>}
        </div>
        <button type="button" className="link" onClick={onEdit}>
          Modifier
        </button>
      </div>
    </div>
  );
}
