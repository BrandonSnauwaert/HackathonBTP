import { api } from "../api/client";
import type { QuoteEvent, QuoteStatus } from "../api/types";
import { StatusBadge } from "../components/Badge";
import { useState } from "react";
import { formatCents, formatDayTime, formatShortDate } from "../format";
import { useQuote } from "../quotes/useQuote";
import { navigate } from "../router";
import { quoteName } from "../quotes/status";
import { ClientCard, ClientSheet } from "./ClientSheet";

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

const EVENT_LABELS: Record<string, string> = {
  created: "devis créé",
  sent_by_email: "envoyé par e-mail",
  sent: "lien du devis créé (partagé par vous)",
  viewed: "ouvert par le client",
  // Indicatif seulement : Apple Mail précharge les images (faux « ouvert »).
  email_opened: "e-mail affiché (indicatif)",
  email_resent: "e-mail renvoyé",
};

function eventLabel(event: QuoteEvent): string {
  const known = EVENT_LABELS[event.type];
  if (known) return known;
  if (event.type !== "status_changed" || !event.toStatus) return event.type;
  const label = STATUS_EVENTS[event.toStatus];
  if (event.toStatus === "accepted" || event.toStatus === "declined") {
    return `${label} ${event.actor === "client" ? "par le client" : "(noté par vous)"}`;
  }
  return label;
}

const RESENDABLE: readonly QuoteStatus[] = ["sent", "viewed", "follow_up"];

const ACTIONS: Partial<Record<QuoteStatus, string>> = {
  accepted: "Marquer accepté",
  declined: "Marquer refusé",
  draft: "Modifier",
};

/** E5 — Suivi d'un devis : état, relance à faire, chronologie, réponse orale du client. */
export function TrackingScreen({ quoteId }: { quoteId: string }) {
  const { quote, error, run, load } = useQuote(quoteId);
  const [copied, setCopied] = useState(false);
  const [resent, setResent] = useState(false);
  const [editingClient, setEditingClient] = useState(false);
  if (!quote) return <p className="loading">{error ?? "Chargement…"}</p>;

  const { client, response } = quote;

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt("Copiez le lien du devis :", url);
    }
  };

  const resend = async () => {
    setResent(false);
    setResent(await run(() => api.resendEmail(quote.id)));
  };
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
        {response && (
          <div className={`card pad ${response.decision === "accepted" ? "ok" : ""}`}>
            <div className="row start">
              <div className={`ic ${response.decision === "accepted" ? "green" : "grey"}`}>
                {response.decision === "accepted" ? "✓" : "✕"}
              </div>
              <span className="b">
                {response.decision === "accepted" ? "Bon pour accord" : "Devis refusé"} · {formatDayTime(response.at)}
              </span>
            </div>
            {response.name && (
              <div>
                {response.decision === "accepted" ? "Signé par " : "Par "}
                <span className="b">{response.name}</span>
              </div>
            )}
            {response.message && <div className="card flat small">« {response.message} »</div>}
          </div>
        )}
        {!response && quote.viewedAt && (
          <div className="card pad">
            <div className="row start">
              <div className="ic blue">◉</div>
              <span className="b">
                {client.name} a ouvert le devis · {formatDayTime(quote.viewedAt)}
              </span>
            </div>
          </div>
        )}
        <ClientCard quote={quote} onEdit={() => setEditingClient(true)} />
        {quote.publicUrl && (
          <div className="card pad">
            <div className="row">
              <span className="b">Page du devis</span>
              <a className="link" href={quote.publicUrl} target="_blank" rel="noreferrer">
                Ouvrir ↗
              </a>
            </div>
            <div className="mut small url-text">{quote.publicUrl}</div>
            <div className="btns">
              <button className="btn" onClick={() => void copyLink(quote.publicUrl ?? "")}>
                {copied ? "Lien copié ✓" : "Copier le lien"}
              </button>
              {RESENDABLE.includes(quote.status) && client.email && (
                <button className="btn" onClick={() => void resend()}>
                  {resent ? "E-mail renvoyé ✓" : "Renvoyer l'e-mail"}
                </button>
              )}
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

      {editingClient && <ClientSheet quote={quote} onClose={() => setEditingClient(false)} onSaved={load} />}
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
