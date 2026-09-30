import { useState } from "react";
import { api } from "../api/client";
import type { Company } from "../api/types";
import { useClipRecorder } from "../audio/useClipRecorder";
import { StatusBadge } from "../components/Badge";
import { ClipCards } from "../components/ClipCards";
import { LineItem } from "../components/LineItem";
import { PhotoButton } from "../components/PhotoButton";
import { SiteNotes } from "../components/SiteNotes";
import { TalkButton } from "../components/TalkButton";
import { Totals } from "../components/Totals";
import { formatCents } from "../format";
import { groupByRoom, isEditable, needsReview } from "../quotes/status";
import { useQuote } from "../quotes/useQuote";
import { navigate } from "../router";
import { ClientCard, ClientSheet } from "./ClientSheet";
import { NewLineSheet } from "./NewLineSheet";

/** E3 — Devis : lignes regroupées par pièce, prix et TVA à compléter, dictée d'une modification. */
export function QuoteScreen({ quoteId, company }: { quoteId: string; company: Company | null }) {
  const { quote, error, uploads, load, run, send, addClip, retryClip } = useQuote(quoteId);
  const recorder = useClipRecorder();
  const [sheet, setSheet] = useState<"line" | "labor" | "client" | null>(null);
  const hourlyRateCents = company?.hourlyRateCents ?? null;

  if (!quote) return <p className="loading">{error ?? "Chargement…"}</p>;

  const editable = isEditable(quote.status);
  const toReview = quote.lines.filter(needsReview).length;
  const blocking = quote.issues.length;
  const lineCount = quote.lines.length;
  // Les lignes sans prix ont déjà leur encadré jaune : on n'affiche ici que les autres points manquants.
  const otherIssues = quote.issues.filter((issue) => !issue.includes("sans prix"));

  const sendButton = (
    <button
      className={`btn ${blocking > 0 ? "dis" : "pri"}`}
      disabled={blocking > 0}
      onClick={() => navigate({ name: editable ? "send" : "tracking", id: quote.id })}
    >
      {editable ? "Vérifier et envoyer" : "Voir le suivi"}
      {blocking > 0 && ` · ${blocking} à compléter`}
    </button>
  );

  return (
    <div className="screen quote">
      <header className="hd">
        <div className="row">
          <button className="back" onClick={() => navigate({ name: "home" })}>
            ‹ Accueil
          </button>
          <StatusBadge status={quote.status} label={quote.statusLabel} />
        </div>
        <h1 className="h1 quote-title">
          {quote.client.name}
          {quote.siteAddress && <span className="mut only-desktop"> · {quote.siteAddress}</span>}
        </h1>
        <div className="only-mobile">
          <div className="big">
            {formatCents(quote.totals.totalTtcCents)} <small>TTC</small>
          </div>
        </div>
        <div className="mut">
          {quote.number}
          {quote.title && ` · ${quote.title}`} · {lineCount} poste{lineCount > 1 ? "s" : ""}
        </div>
      </header>

      <div className="quote-layout">
        <div className="bd">
          {error && <p className="error-text">{error}</p>}
          <ClientCard quote={quote} onEdit={() => setSheet("client")} />
          {!editable && (
            <button className="card flat action" onClick={() => navigate({ name: "tracking", id: quote.id })}>
              <span className="grow">Ce devis a été envoyé : consultation seule, il n'est plus modifiable.</span>
              <span className="b blue-text">Suivi ›</span>
            </button>
          )}
          {toReview > 0 && (
            <div className="card w row">
              <span className="b">
                ! {toReview} ligne{toReview > 1 ? "s" : ""} à chiffrer
              </span>
              <span className="small">prix unitaire HT</span>
            </div>
          )}
          {otherIssues.length > 0 && (
            <ul className="card issues">
              {otherIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}

          <div className="lines">
            <div className="line-head only-desktop" aria-hidden="true">
              <span>Désignation</span>
              <span>Qté</span>
              <span className="r">PU HT</span>
              <span className="r">Total HT</span>
              <span />
            </div>
            {groupByRoom(quote.lines).map((group) => (
              <section key={group.room} className="lot-group">
                <div className="lot">
                  <span>{group.room}</span>
                  <span>{formatCents(group.totalHtCents)} HT</span>
                </div>
                {group.lines.map((line) => (
                  <LineItem
                    // Remontée quand la ligne change côté serveur : les champs reprennent les valeurs enregistrées.
                    key={`${line.id}:${line.updatedAt}`}
                    line={line}
                    editable={editable}
                    vatExempt={quote.totals.vatExempt}
                    onUpdate={(update) => run(() => api.updateLine(quote.id, line.id, update))}
                    onDelete={() => void run(() => api.deleteLine(quote.id, line.id))}
                  />
                ))}
              </section>
            ))}
            <ClipCards clips={quote.clips} uploads={uploads} onResend={(u) => void send(u)} onRetry={retryClip} />
          </div>

          {lineCount === 0 && quote.clips.length === 0 && (
            <div className="card dash">Aucune ligne : maintenez le bouton pour dicter les travaux.</div>
          )}

          <div className="btns">
            {editable && (
              <button className="btn ghost" onClick={() => setSheet("line")}>
                + Ajouter une ligne
              </button>
            )}
            {editable && hourlyRateCents !== null && (
              <button className="btn ghost" onClick={() => setSheet("labor")}>
                + Main d'œuvre ({formatCents(hourlyRateCents)}/h)
              </button>
            )}
            <a className="btn ghost" href={`/apercu/${quote.id}`}>
              Aperçu du document
            </a>
          </div>

          <SiteNotes
            // Remonté quand la note change côté serveur : le champ reprend la valeur enregistrée.
            key={quote.notes}
            quote={quote}
            editable={editable}
            onSave={(notes) => void run(() => api.updateQuote(quote.id, { notes }))}
          />

          {(editable || quote.photos.length > 0) && (
            <section className="photos-block">
              <div className="row">
                <h2 className="b">
                  Photos {quote.photos.length > 0 && <span className="mut">({quote.photos.length})</span>}
                </h2>
                {editable && <PhotoButton quoteId={quote.id} onAdded={() => void load()} className="ghost" />}
              </div>
              {quote.photos.length > 0 && (
                <div className="thumbs">
                  {quote.photos.map((photo) => (
                    <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer">
                      <img className="thumb" src={photo.url} alt={photo.caption || "Photo de chantier"} />
                    </a>
                  ))}
                </div>
              )}
            </section>
          )}

          <div className="card only-mobile">
            <Totals quote={quote} big={false} />
          </div>
        </div>

        <aside className="quote-aside only-desktop">
          <div className="card pad">
            <Totals quote={quote} />
          </div>
          {editable && (
            <div className="card flat">
              <TalkButton recorder={recorder} onClip={addClip} label="Maintenir pour dicter une modification" />
              <span className="small mut">Par exemple : « ajoute une niche de douche »</span>
            </div>
          )}
          {sendButton}
        </aside>
      </div>

      <footer className="ft only-mobile">
        {editable && <TalkButton recorder={recorder} onClip={addClip} label="Maintenir pour dicter une modification" />}
        {recorder.error && <p className="error-text">{recorder.error}</p>}
        {sendButton}
      </footer>

      {(sheet === "line" || sheet === "labor") && (
        <NewLineSheet
          quote={quote}
          hourlyRateCents={hourlyRateCents}
          labor={sheet === "labor"}
          rooms={groupByRoom(quote.lines).map((g) => g.room)}
          onClose={() => setSheet(null)}
          run={run}
        />
      )}
      {sheet === "client" && (
        <ClientSheet client={quote.client} quote={quote} onClose={() => setSheet(null)} onSaved={load} />
      )}
    </div>
  );
}
