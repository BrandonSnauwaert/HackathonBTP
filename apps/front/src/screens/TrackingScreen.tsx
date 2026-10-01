import { ScreenSkeleton } from "../components/Skeleton";
import { api } from "../api/client";
import type { QuoteDetail, QuoteEvent, QuoteStatus } from "../api/types";
import { StatusBadge } from "../components/Badge";
import { Totals } from "../components/Totals";
import { useState } from "react";
import { formatCents, formatDayTime, formatQuantity, formatRelative, formatShortDate } from "../format";
import { useQuote } from "../quotes/useQuote";
import { navigate } from "../router";
import { groupByRoom, quoteName } from "../quotes/status";
import { ClientCard, ClientSheet } from "./ClientSheet";
import { RemindButton } from "../components/RemindButton";

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
  reminder_sent: "relance envoyée par e-mail",
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

/** Réponse orale du client, notée par l'artisan ; ou retour en brouillon (lien seul, pas encore ouvert). */
const ACTIONS: Partial<Record<QuoteStatus, { label: string; className: string }>> = {
  draft: { label: "Modifier", className: "btn ghost" },
  declined: { label: "✕ Marquer refusé", className: "btn" },
  accepted: { label: "✓ Marquer accepté", className: "btn ok" },
};
const ACTION_ORDER: QuoteStatus[] = ["draft", "declined", "accepted"];

/** Le devis tel qu'envoyé : lignes par pièce et totaux ; notes, dictées et photos dans le détail complet. */
function QuoteContent({ quote }: { quote: QuoteDetail }) {
  const extras = [
    quote.clips.length > 0 && `${quote.clips.length} dictée${quote.clips.length > 1 ? "s" : ""}`,
    quote.photos.length > 0 && `${quote.photos.length} photo${quote.photos.length > 1 ? "s" : ""}`,
    quote.notes && "notes",
  ].filter(Boolean);
  return (
    <section className="card pad quote-content">
      <div className="row">
        <h2 className="h2">Détail du devis</h2>
        <button className="link" onClick={() => navigate({ name: "quote", id: quote.id })}>
          Tout voir ›
        </button>
      </div>
      {groupByRoom(quote.lines).map((group) => (
        <div key={group.room} className="qc-group">
          <div className="qc-room">{group.room}</div>
          {group.lines.map((line) => (
            <div key={line.id} className="qc-line">
              <span className="grow">{line.description}</span>
              <span className="mut nowrap">
                {formatQuantity(line.quantity)} {line.unitLabel}
              </span>
              <span className="b nowrap r">{line.totalHtCents === null ? "—" : formatCents(line.totalHtCents)}</span>
            </div>
          ))}
        </div>
      ))}
      <Totals quote={quote} big={false} />
      {extras.length > 0 && (
        <button className="card flat action small" onClick={() => navigate({ name: "quote", id: quote.id })}>
          <span className="grow">Notes de chantier : {extras.join(" · ")}</span>
          <span className="b blue-text">›</span>
        </button>
      )}
    </section>
  );
}

/** E5 — Suivi d'un devis : état, relance à faire, chronologie, réponse orale du client. */
export function TrackingScreen({ quoteId }: { quoteId: string }) {
  const { quote, error, run, load } = useQuote(quoteId);
  const [copied, setCopied] = useState(false);
  const [resent, setResent] = useState(false);
  const [editingClient, setEditingClient] = useState(false);
  if (!quote) return <ScreenSkeleton error={error} />;

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
  const actions = ACTION_ORDER.filter((status) => quote.allowedTransitions.includes(status));

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
        <div className="tracking-col">
          {error && <p className="error-text">{error}</p>}
          {quote.status === "follow_up" && (
            <div className={`card pad ${quote.reminderDue ? "w" : ""}`}>
              <div className="row start">
                <div className={`ic ${quote.reminderDue ? "yellow" : "grey"}`}>↻</div>
                <span className="b">
                  {quote.reminderDue
                    ? "Relance conseillée"
                    : `Relancé ${quote.remindedAt ? formatRelative(quote.remindedAt) : ""}`}
                </span>
              </div>
              <div className="h2">{client.name} n'a pas encore répondu.</div>
              {quote.reminderDue && client.email && (
                <RemindButton quoteId={quote.id} onDone={() => void load()} className="big" />
              )}
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
              {response.signature && (
                <img className="signature-image" src={response.signature} alt={`Signature de ${response.name}`} />
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
          <QuoteContent quote={quote} />
          <ClientCard quote={quote} onEdit={() => setEditingClient(true)} />
        </div>

        <div className="tracking-col">
          {quote.publicUrl && (
            <div className="card pad">
              <div className="row">
                <span className="b">Page du devis</span>
                {/* L'aperçu, pas le lien du client : l'ouvrir soi-même ferait passer le devis en « consulté ». */}
                <a className="link" href={`/apercu/${quote.id}`}>
                  Voir le devis
                </a>
              </div>
              <div className="mut small">Lien du client (l'ouvrir vous-même le marquerait « consulté ») :</div>
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
      </div>

      {editingClient && (
        <ClientSheet client={quote.client} quote={quote} onClose={() => setEditingClient(false)} onSaved={load} />
      )}
      {actions.length > 0 && (
        <footer className="ft actions">
          {actions.map((status) => (
            <button key={status} className={ACTIONS[status]?.className} onClick={() => void act(status)}>
              {ACTIONS[status]?.label}
            </button>
          ))}
        </footer>
      )}
    </div>
  );
}
