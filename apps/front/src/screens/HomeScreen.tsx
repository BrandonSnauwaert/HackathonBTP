import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { QuoteSummary } from "../api/types";
import { Logo, type Session } from "../components/AppShell";
import { formatToday, initials } from "../format";
import { FILTERS, isEditable, openQuote, quoteName, type FilterId } from "../quotes/status";
import { errorMessage, isNetworkError } from "../quotes/useQuote";
import { navigate } from "../router";
import { NewVisitSheet } from "./NewVisitSheet";
import { QuoteRow } from "../components/QuoteRow";
import { RemindButton } from "../components/RemindButton";
import { QuoteRowsSkeleton } from "../components/Skeleton";
import { SORTS, compare, nextSort, type SortId } from "../quotes/sort";

const HOME_POLL_MS = 5000;

function SortHeader(props: {
  label: string;
  column: "amount" | "activity";
  sort: SortId;
  onSort: (s: SortId) => void;
  className?: string;
}) {
  const { label, column, sort, onSort } = props;
  const direction = sort === `${column}-desc` ? "descending" : sort === `${column}-asc` ? "ascending" : "none";
  return (
    <button
      type="button"
      className={`th-sort ${direction !== "none" ? "on" : ""} ${props.className ?? ""}`}
      aria-label={`Trier par ${label.toLowerCase()}`}
      onClick={() => onSort(nextSort(sort, column))}
    >
      {label}
      <span aria-hidden="true">{direction === "descending" ? " ↓" : direction === "ascending" ? " ↑" : " ⇅"}</span>
    </button>
  );
}

/** E1 — Accueil : ce qui demande une action, quelques chiffres, la liste des devis. */
export function HomeScreen({ session }: { session: Session }) {
  const [quotes, setQuotes] = useState<QuoteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");
  const [creating, setCreating] = useState(false);
  const [sort, setSort] = useState<SortId>("priority");

  const load = useCallback(
    () =>
      api.listQuotes().then(
        (list) => {
          setQuotes(list);
          setError(null);
        },
        (err: unknown) => setError((previous) => (isNetworkError(err) ? previous : errorMessage(err))),
      ),
    [],
  );

  // Rafraîchie régulièrement : les statuts changent quand le client ouvre ou accepte un devis.
  useEffect(() => {
    void load();
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), HOME_POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const remindButton = (q: QuoteSummary) =>
    q.reminderDue ? <RemindButton quoteId={q.id} onDone={() => void load()} /> : null;

  const all = [...(quotes ?? [])].sort(compare(sort));
  const statuses = FILTERS.find((f) => f.id === filter)?.statuses ?? null;
  const shown = statuses ? all.filter((q) => (statuses as readonly string[]).includes(q.status)) : all;
  // Relances à faire : « à relancer » et pas encore relancé (un devis relancé revient au bout du délai).
  const toFollowUp = all.filter((q) => q.reminderDue);
  const toPrice = all.filter((q) => isEditable(q.status) && q.unpricedLineCount > 0);
  const companyName = session.company?.name || session.user.email;

  return (
    <div className="screen home">
      <header className="hd">
        <div className="row only-mobile">
          <div className="row start">
            <Logo />
            <span className="b">BatiDevis</span>
          </div>
          <div className="row start">
            <button className="btn ghost" onClick={() => navigate({ name: "stats" })}>
              Stats
            </button>
            <button className="btn ghost" onClick={() => navigate({ name: "clients" })}>
              Clients
            </button>
            <button className="ic avatar" onClick={() => navigate({ name: "profile" })} title="Mon entreprise">
              {initials(companyName)}
            </button>
          </div>
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
            <h2 className="h2">À faire aujourd'hui</h2>
            {toFollowUp.map((q) => (
              <div key={q.id} className="card w action">
                <button className="todo-main" onClick={() => openQuote(q)}>
                  <div className="ic yellow">↻</div>
                  <div className="grow">
                    <div className="b">Relancer {q.client.name}</div>
                    <div className="small">Pas de réponse depuis l'envoi · {q.title || q.number}</div>
                  </div>
                </button>
                {remindButton(q)}
              </div>
            ))}
            {toPrice.map((q) => (
              <button key={q.id} className="card info action" onClick={() => openQuote(q)}>
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
          {/* Sur téléphone, pas d'en-têtes de colonnes : le tri passe par une liste. */}
          <label className="sort-select only-mobile">
            <span className="mut small">Trier</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortId)}>
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="qlist">
          <div className="qrow th only-desktop">
            <span>Devis</span>
            <SortHeader label="Montant TTC" column="amount" sort={sort} onSort={setSort} className="r" />
            <span>Statut</span>
            <SortHeader label="Dernière activité" column="activity" sort={sort} onSort={setSort} />
            <span className="r">Action</span>
          </div>
          {quotes === null && !error && <QuoteRowsSkeleton />}
          {quotes !== null && shown.length === 0 && <p className="mut empty">Aucun devis ici.</p>}
          {shown.map((q) => (
            <QuoteRow key={q.id} quote={q} name={quoteName(q)} action={remindButton(q)} />
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
