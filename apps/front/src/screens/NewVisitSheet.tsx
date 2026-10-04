import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Client } from "../api/types";
import { oneLine, suggestClients } from "../clients/clients";
import { createLocalVisit, type NewVisit } from "../offline/pendingVisits";
import { errorMessage, isNetworkError } from "../quotes/useQuote";
import { navigate } from "../router";

/**
 * Infos du client, saisies au clavier avant la visite (une adresse e-mail dictée, c'est risqué).
 * Un client déjà connu est proposé dès les premières lettres : ses coordonnées se remplissent seules.
 * Crée le devis en brouillon puis ouvre l'écran de visite. Sans réseau, la visite commence quand même :
 * le devis sera créé au retour de la connexion (cf. offline/pendingVisits.ts).
 */
export function NewVisitSheet({ onClose, client: preset }: { onClose: () => void; client?: Client }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<Client | null>(preset ?? null);
  const [name, setName] = useState(preset?.name ?? "");
  const [phone, setPhone] = useState(preset?.phone ?? "");
  const [email, setEmail] = useState(preset?.email ?? "");
  const [siteAddress, setSiteAddress] = useState(oneLine(preset?.address ?? ""));
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Sans réseau, pas de suggestions : la saisie reste possible.
    api.listClients().then(setClients, () => undefined);
  }, []);

  const suggestions = selected ? [] : suggestClients(clients, name);

  const pick = (client: Client) => {
    setSelected(client);
    setName(client.name);
    setEmail(client.email);
    setPhone(client.phone);
    if (!siteAddress) setSiteAddress(oneLine(client.address));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    // Coordonnées corrigées au passage : la fiche du client est mise à jour.
    const clientUpdate =
      selected && (email.trim() !== selected.email || phone.trim() !== selected.phone)
        ? { email: email.trim(), phone: phone.trim() }
        : undefined;
    const visit: NewVisit = {
      who: selected
        ? { clientId: selected.id }
        : {
            client: {
              name: name.trim(),
              ...(email && { email: email.trim() }),
              ...(phone && { phone: phone.trim() }),
            },
          },
      ...(clientUpdate && { clientUpdate }),
      clientName: name.trim(),
      title: title.trim(),
      siteAddress: siteAddress.trim(),
    };
    const startOffline = () => navigate({ name: "visit", id: createLocalVisit(visit).localId });
    if (!navigator.onLine) return startOffline();
    try {
      if (selected && clientUpdate) await api.updateClient(selected.id, clientUpdate);
      const quote = await api.createQuote(visit.who, visit.title, visit.siteAddress);
      navigate({ name: "visit", id: quote.id });
    } catch (err) {
      if (isNetworkError(err)) return startOffline();
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
        <div className="field">
          <label className="field">
            <span>Client *</span>
            <input
              required
              autoFocus={!preset}
              autoComplete="off"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSelected(null);
              }}
              placeholder="Mme Durand"
            />
          </label>
          {selected && (
            <span className="small green-text">
              ✓ Client existant{" "}
              <button
                type="button"
                className="link"
                onClick={() => {
                  setSelected(null);
                  setName("");
                  setEmail("");
                  setPhone("");
                }}
              >
                changer
              </button>
            </span>
          )}
          {suggestions.length > 0 && (
            <div className="suggestions" role="listbox" aria-label="Clients existants">
              {suggestions.map((c) => (
                <button key={c.id} type="button" role="option" aria-selected={false} onClick={() => pick(c)}>
                  <span className="b">{c.name}</span>
                  <span className="mut small">{[c.email, c.phone].filter(Boolean).join(" · ")}</span>
                </button>
              ))}
            </div>
          )}
        </div>
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
