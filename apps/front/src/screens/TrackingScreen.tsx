import { api } from "../api/client";
import type { QuoteEvent, QuoteStatus } from "../api/types";
import { StatusBadge } from "../components/Badge";
import { formatCents, formatDayTime, formatShortDate } from "../format";
import { useQuote } from "../quotes/useQuote";
import { navigate } from "../router";
import { quoteName } from "../quotes/status";

const STATUS_EVENTS: Record<QuoteStatus, string> = {
  draft: "repassé en brouillon",
  ready: "validé, prêt à envoyer",
  sent: "envoyé au client",
  viewed: "consulté par le client",
  follow_up: "sans réponse : à relancer",
  accepted: "accepté",
  declined: "refusé",
  expired: "expiré",
};

function eventLabel(event: QuoteEvent): string {
  if (event.type === "created") return "devis créé";
  if (event.type !== "status_changed" || !event.toStatus) return event.type;
  const label = STATUS_EVENTS[event.toStatus];
  if (event.toStatus === "accepted" || event.toStatus === "declined") {
    return `${label} ${event.actor === "client" ? "par le client" : "(noté par vous)"}`;
  }
  return label;
}

const ACTIONS: Partial<Record<QuoteStatus, string>> = {
  accepted: "Marquer accepté",
  declined: "Marquer refusé",
  draft: "Modifier",
};

/** E5 — Suivi d'un devis : état, relance à faire, chronologie, réponse orale du client. */
export function TrackingScreen({ quoteId }: { quoteId: string }) {
  const { quote, error, run } = useQuote(quoteId);
  if (!quote) return <p className="loading">{error ?? "Chargement…"}</p>;

  const { client } = quote;
  const events = [...quote.events].reverse();

  const act = async (status: QuoteStatus) => {
    const ok = await run(() => api.changeStatus(quote.id, status));
    if (ok && status === "draft") navigate({ name: "quote", id: quote.id });
  };

  return (
    <div className="screen tracking">
      <header className="hd">
        <button className="back" onClick={() => navigate({ name: "home" })}>
          ‹ Accueil
        </button>
        <div className="row wrap">
          <h1 className="h1">{quoteName(quote)}</h1>
          <StatusBadge status={quote.status} label={quote.statusLabel} />
        </div>
        <div className="h2">{formatCents(quote.totals.totalTtcCents)} TTC</div>
        <div className="mut small">
          Devis n° {quote.number}
          {quote.sentAt && ` · envoyé le ${formatShortDate(quote.sentAt)}`}
          {quote.validUntil && ` · expire le ${formatShortDate(quote.validUntil)}`}
        </div>
      </header>

      <div className="bd tracking-grid">
        {error && <p className="error-text">{error}</p>}
        {quote.status === "follow_up" && (
          <div className="card w pad">
            <div className="row start">
              <div className="ic yellow">↻</div>
              <span className="b">Relance conseillée</span>
            </div>
            <div className="h2">{client.name} n'a pas encore répondu.</div>
            <div className="btns">
              {client.phone && (
                <a className="btn pri" href={`tel:${client.phone.replace(/\s/g, "")}`}>
                  Appeler
                </a>
              )}
              {client.email && (
                <a
                  className="btn"
                  href={`mailto:${client.email}?subject=${encodeURIComponent(`Devis ${quote.number}`)}`}
                >
                  Écrire
                </a>
              )}
            </div>
          </div>
        )}
        {quote.status === "viewed" && (
          <div className="card pad">
            <div className="row start">
              <div className="ic blue">◉</div>
              <span className="b">{client.name} a ouvert le devis.</span>
            </div>
          </div>
        )}

        <div className="card pad">
          <h2 className="h2">Chronologie</h2>
          <div className="tl">
            {events.map((event) => (
              <div key={event.id}>
                <span className="b">{formatDayTime(event.createdAt)}</span> · {eventLabel(event)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {quote.allowedTransitions.some((s) => ACTIONS[s]) && (
        <footer className="ft actions">
          {quote.allowedTransitions
            .filter((status) => ACTIONS[status])
            .map((status) => (
              <button key={status} className="btn ghost" onClick={() => void act(status)}>
                {ACTIONS[status]}
              </button>
            ))}
        </footer>
      )}
    </div>
  );
}
