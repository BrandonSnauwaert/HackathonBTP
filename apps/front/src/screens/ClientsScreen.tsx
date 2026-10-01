import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Client, QuoteSummary } from "../api/types";
import { QuoteRow } from "../components/QuoteRow";
import { ClientRowsSkeleton, ScreenSkeleton, Skeleton } from "../components/Skeleton";
import { formatCents, formatRelative, initials } from "../format";
import { clientStats, searchClients } from "../clients/clients";
import { errorMessage, isNetworkError } from "../quotes/useQuote";
import { navigate } from "../router";
import { ClientSheet } from "./ClientSheet";
import { NewVisitSheet } from "./NewVisitSheet";

/** Clients et devis, rechargés ensemble (les chiffres de chaque client viennent de ses devis). */
function useClientsData() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [c, q] = await Promise.all([api.listClients(), api.listQuotes()]);
      setClients(c);
      setQuotes(q);
      setError(null);
    } catch (err) {
      setError(isNetworkError(err) ? "Hors connexion : la liste des clients n'est pas disponible." : errorMessage(err));
    }
  };

  useEffect(() => {
    // Chargement de données depuis l'API : c'est bien une synchronisation avec un système externe.
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, []);

  return { clients, quotes, error, load };
}

/** Clients : recherche, derniers clients actifs en tête, chiffres de chacun. */
export function ClientsScreen() {
  const { clients, quotes, error } = useClientsData();
  const [search, setSearch] = useState("");

  const query = search.trim();
  const rows = searchClients(clients ?? [], query)
    .map((client) => ({ client, stats: clientStats(client, quotes) }))
    .sort((a, b) => b.stats.lastActivity.localeCompare(a.stats.lastActivity));

  return (
    <div className="screen clients">
      <header className="hd">
        <button className="back only-mobile" onClick={() => navigate({ name: "home" })}>
          ‹ Accueil
        </button>
        <h1 className="h1">Clients</h1>
        <div className="mut">
          {clients === null ? <Skeleton w={80} h={16} /> : `${clients.length} client${clients.length > 1 ? "s" : ""}`}
        </div>
      </header>

      <div className="bd">
        {error && <p className="error-text">{error}</p>}
        <label className="field">
          <input
            type="search"
            aria-label="Rechercher un client"
            placeholder="Rechercher : nom, e-mail, téléphone, adresse"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <div className="clist">
          {clients === null && !error && <ClientRowsSkeleton />}
          {clients !== null && rows.length === 0 && (
            <p className="mut empty">{query ? "Aucun client ne correspond." : "Aucun client pour l'instant."}</p>
          )}
          {rows.map(({ client, stats }) => (
            <button key={client.id} className="card crow" onClick={() => navigate({ name: "client", id: client.id })}>
              <div className="ic avatar">{initials(client.name)}</div>
              <div className="grow">
                <div className="b">{client.name}</div>
                <div className="mut small c-contact">
                  {[client.email, client.phone].filter(Boolean).join(" · ") || "Pas de coordonnées"}
                </div>
              </div>
              <div className="c-stats small">
                <span className="b">
                  {stats.quotes.length} devis
                  {stats.waiting > 0 && <span className="blue-text"> · {stats.waiting} en attente</span>}
                </span>
                {stats.acceptedHtCents > 0 && (
                  <span className="green-text">{formatCents(stats.acceptedHtCents)} HT acceptés</span>
                )}
                <span className="mut">{formatRelative(stats.lastActivity)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Fiche client : coordonnées (modifiables), chiffres, tous ses devis, nouveau devis sans ressaisie. */
export function ClientScreen({ clientId }: { clientId: string }) {
  const { clients, quotes, error, load } = useClientsData();
  const [sheet, setSheet] = useState<"edit" | "visit" | null>(null);
  const client = clients?.find((c) => c.id === clientId);

  if (!client) {
    if (clients === null) return <ScreenSkeleton error={error} />;
    return <p className="loading">Client introuvable.</p>;
  }

  const stats = clientStats(client, quotes);
  const quoteLabel = (q: QuoteSummary) => (q.title ? `${q.title} · ${q.number}` : q.number);

  return (
    <div className="screen client">
      <header className="hd">
        <button className="back" onClick={() => navigate({ name: "clients" })}>
          ‹ Clients
        </button>
        <div className="row">
          <h1 className="h1">{client.name}</h1>
          <button className="btn pri only-desktop" onClick={() => setSheet("visit")}>
            + Nouveau devis
          </button>
        </div>
      </header>

      <div className="bd">
        {error && <p className="error-text">{error}</p>}
        <div className="card client-card">
          <div className="row">
            <div className="grow">
              {client.email ? (
                <a className="small" href={`mailto:${client.email}`}>
                  {client.email}
                </a>
              ) : (
                <div className="small warn-text">E-mail manquant</div>
              )}
              {client.phone && (
                <div>
                  <a className="small" href={`tel:${client.phone.replace(/\s/g, "")}`}>
                    {client.phone}
                  </a>
                </div>
              )}
              {client.address && <div className="small mut notes-text">{client.address}</div>}
            </div>
            <button type="button" className="link" onClick={() => setSheet("edit")}>
              Modifier
            </button>
          </div>
        </div>

        <div className="stats">
          <div className="card stat">
            <div className="h2">{stats.quotes.length}</div>
            <div className="mut small">devis</div>
          </div>
          <div className="card stat">
            <div className="h2">{stats.waiting}</div>
            <div className="mut small">en attente</div>
          </div>
          <div className="card stat wide">
            <div className="h2">{formatCents(stats.acceptedHtCents).replace(/,00\s/, " ")}</div>
            <div className="mut small">HT acceptés</div>
          </div>
        </div>

        <h2 className="h2">Devis</h2>
        <div className="qlist">
          <div className="qrow th only-desktop" aria-hidden="true">
            <span>Devis</span>
            <span className="r">Montant TTC</span>
            <span>Statut</span>
            <span>Dernière activité</span>
            <span />
          </div>
          {stats.quotes.length === 0 && <p className="mut empty">Aucun devis pour ce client.</p>}
          {stats.quotes.map((q) => (
            <QuoteRow key={q.id} quote={q} name={quoteLabel(q)} />
          ))}
        </div>
      </div>

      <footer className="ft only-mobile">
        <button className="btn pri" onClick={() => setSheet("visit")}>
          + Nouveau devis
        </button>
      </footer>

      {sheet === "edit" && <ClientSheet client={client} onClose={() => setSheet(null)} onSaved={load} />}
      {sheet === "visit" && <NewVisitSheet client={client} onClose={() => setSheet(null)} />}
    </div>
  );
}
