import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { QuoteSummary } from "../api/types";
import { Logo, type Session } from "../components/AppShell";
import { StatusBadge } from "../components/Badge";
import { formatCents, formatRelative, formatToday, initials } from "../format";
import { FILTERS, isEditable, openQuote, quoteName, type FilterId } from "../quotes/status";
import { errorMessage } from "../quotes/useQuote";
import { NewVisitSheet } from "./NewVisitSheet";

const WAITING = new Set(["sent", "viewed", "follow_up"]);

function activity(q: QuoteSummary): string {
  if (q.status === "sent" && q.sentAt) return `Envoyé ${formatRelative(q.sentAt)}`;
  return `Mis à jour ${formatRelative(q.updatedAt)}`;
}

/** E1 — Accueil : ce qui demande une action, quelques chiffres, la liste des devis. */
export function HomeScreen({ session }: { session: Session }) {
  const [quotes, setQuotes] = useState<QuoteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.listQuotes().then(setQuotes, (err: unknown) => setError(errorMessage(err)));
  }, []);

  const all = quotes ?? [];
  const statuses = FILTERS.find((f) => f.id === filter)?.statuses ?? null;
  const shown = statuses ? all.filter((q) => (statuses as readonly string[]).includes(q.status)) : all;
  const toFollowUp = all.filter((q) => q.status === "follow_up");
  const toPrice = all.filter((q) => isEditable(q.status) && q.unpricedLineCount > 0);
  const sentCount = all.filter((q) => q.sentAt !== null).length;
  const waitingCount = all.filter((q) => WAITING.has(q.status)).length;
  const acceptedHt = all.filter((q) => q.status === "accepted").reduce((sum, q) => sum + q.totalHtCents, 0);
  const companyName = session.company?.name || session.user.email;

  return (
    <div className="screen home">
      <header className="hd">
        <div className="row only-mobile">
          <div className="row start">
            <Logo />
            <span className="b">Devis Vocal</span>
          </div>
          <button className="ic avatar" onClick={session.logout} title="Se déconnecter">
            {initials(companyName)}
          </button>
        </div>
        <div className="row">
          <div>
            <h1 className="h1">Bonjour</h1>
            <div className="mut">{formatToday()}</div>
          </div>
          <button className="btn pri only-desktop" onClick={() => setCreating(true)}>
            + Nouvelle visite
          </button>
        </div>
      </header>

      <div className="bd">
        {error && <p className="error-text">{error}</p>}
        {(toFollowUp.length > 0 || toPrice.length > 0) && (
          <section className="todo">
            <h2 className="h2 only-mobile">À faire aujourd'hui</h2>
            {toFollowUp.map((q) => (
              <button key={q.id} className="card w action" onClick={() => openQuote(q)}>
                <div className="ic yellow">↻</div>
                <div className="grow">
                  <div className="b">Relancer {q.client.name}</div>
                  <div className="small">Pas de réponse depuis l'envoi · {q.title || q.number}</div>
                </div>
                <span className="mut">›</span>
              </button>
            ))}
            {toPrice.map((q) => (
              <button key={q.id} className="card action" onClick={() => openQuote(q)}>
                <div className="ic blue">€</div>
                <div className="grow">
                  <div className="b">
                    {q.unpricedLineCount} ligne{q.unpricedLineCount > 1 ? "s" : ""} à chiffrer
                  </div>
                  <div className="mut small">{quoteName(q)}</div>
                </div>
                <span className="mut">›</span>
              </button>
            ))}
          </section>
        )}

        <div className="stats">
          <div className="card stat">
            <div className="h2">{sentCount}</div>
            <div className="mut small">devis envoyés</div>
          </div>
          <div className="card stat">
            <div className="h2">{waitingCount}</div>
            <div className="mut small">en attente</div>
          </div>
          <div className="card stat wide">
            <div className="h2">{formatCents(acceptedHt).replace(/,00\s/, " ")}</div>
            <div className="mut small">HT acceptés</div>
          </div>
        </div>

        <div className="list-head">
          <h2 className="h2 only-desktop">Mes devis</h2>
          <div className="chips" role="tablist">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                className={`chip ${filter === f.id ? "on" : ""}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="qlist">
          <div className="qrow th only-desktop" aria-hidden="true">
            <span>Devis</span>
            <span className="r">Montant TTC</span>
            <span>Statut</span>
            <span>Dernière activité</span>
          </div>
          {quotes === null && !error && <p className="mut">Chargement…</p>}
          {quotes !== null && shown.length === 0 && <p className="mut empty">Aucun devis ici.</p>}
          {shown.map((q) => (
            <button key={q.id} className="qrow card" onClick={() => openQuote(q)}>
              <span className="q-name b">{quoteName(q)}</span>
              <span className="q-amount b r">{formatCents(q.totalTtcCents)}</span>
              <span className="q-status">
                <StatusBadge status={q.status} label={q.statusLabel} />
              </span>
              <span className="q-activity mut small">{activity(q)}</span>
            </button>
          ))}
        </div>
      </div>

      <footer className="ft only-mobile">
        <button className="btn pri" onClick={() => setCreating(true)}>
          + Nouvelle visite
        </button>
      </footer>

      {creating && <NewVisitSheet onClose={() => setCreating(false)} />}
    </div>
  );
}
