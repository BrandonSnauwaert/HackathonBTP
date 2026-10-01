import { ScreenSkeleton } from "../components/Skeleton";
import { useState } from "react";
import { api } from "../api/client";
import type { Company, QuoteDetail } from "../api/types";
import { Badge } from "../components/Badge";
import { Totals } from "../components/Totals";
import { useQuote } from "../quotes/useQuote";
import { navigate } from "../router";

interface Mention {
  label: string;
  ok: boolean;
  /** Absente mais pas bloquante pour l'API (l'artisan peut la compléter ici). */
  optional?: boolean;
}

/** Mentions obligatoires d'un devis BTP (voir CONTEXTE.md), vérifiées sur le profil et le devis. */
function mentions(quote: QuoteDetail, company: Company | null): Mention[] {
  const c = company;
  return [
    { label: c?.siret ? `SIRET ${c.siret}` : "SIRET", ok: Boolean(c?.siret) },
    { label: "Assurance décennale", ok: Boolean(c?.insurerName && c.insurancePolicyNumber) },
    { label: "Coordonnées de l'entreprise", ok: Boolean(c?.name && c.address) },
    {
      label: c?.vatExempt ? "Mention de franchise de TVA" : "N° de TVA intracommunautaire",
      ok: Boolean(c?.vatExempt || c?.vatNumber),
    },
    {
      label: quote.client.email ? `E-mail du client : ${quote.client.email}` : "E-mail du client",
      ok: Boolean(quote.client.email),
    },
    { label: "Quantités, prix unitaires et TVA", ok: quote.lines.length > 0 && quote.totals.unpricedLineCount === 0 },
    { label: `Validité ${quote.validityDays} jours`, ok: quote.validityDays > 0 },
    { label: "Conditions de paiement", ok: Boolean(quote.paymentTerms || c?.defaultPaymentTerms) },
    { label: "Date de début et durée des travaux", ok: Boolean(quote.startDate && quote.duration), optional: true },
  ];
}

/**
 * E4 — Envoi : contrôle des mentions obligatoires, date de début et durée, puis envoi
 * (e-mail avec le bouton « Voir le devis », ou lien seul que l'artisan partage lui-même).
 */
export function SendScreen({ quoteId, company }: { quoteId: string; company: Company | null }) {
  const { quote, error, run } = useQuote(quoteId);
  const [byEmail, setByEmail] = useState(true);
  if (!quote) return <ScreenSkeleton error={error} />;

  const list = mentions(quote, company);
  const okCount = list.filter((m) => m.ok).length;
  // Objet de l'e-mail tel que le serveur l'écrit (src/email/quote-email.ts).
  const subject = `Votre devis ${quote.number} de ${company?.name ?? "votre artisan"}`;

  return (
    <div className="screen send">
      <header className="hd">
        <button className="back" onClick={() => navigate({ name: "quote", id: quote.id })}>
          ‹ Devis n° {quote.number}
        </button>
        <h1 className="h1">Envoyer à {quote.client.name}</h1>
      </header>

      <div className="send-layout">
        <div className="bd">
          {error && <p className="error-text">{error}</p>}
          <div className="card">
            <div className="row">
              <span className="b">Mentions obligatoires</span>
              <Badge tone={okCount === list.length ? "ok" : "w"}>
                {okCount === list.length ? "✓" : "!"} {okCount} / {list.length}
              </Badge>
            </div>
            <div className="checks">
              {list.map((m) => (
                <div key={m.label} className="ck">
                  <b className={m.ok ? "" : "no"}>{m.ok ? "✓" : "!"}</b>
                  {m.label}
                </div>
              ))}
            </div>
            {list.slice(0, 4).some((m) => !m.ok) && (
              <button className="link small" onClick={() => navigate({ name: "profile" })}>
                Compléter mon entreprise ›
              </button>
            )}
          </div>

          <ScheduleCard quote={quote} onSave={(update) => void run(() => api.updateQuote(quote.id, update))} />

          <div className="b">Envoyer par</div>
          <div className="seg">
            <button type="button" className={byEmail ? "on" : ""} onClick={() => setByEmail(true)}>
              E-mail
            </button>
            <button type="button" className={byEmail ? "" : "on"} onClick={() => setByEmail(false)}>
              Lien seul
            </button>
          </div>
          {byEmail ? (
            <div className="card flat small">
              <span className="b">« {subject} »</span>
              <span className="mut">
                À {quote.client.email || "(e-mail du client manquant)"} : montant, date de validité et bouton « Voir le
                devis ». Les réponses du client arrivent sur votre adresse.
              </span>
            </div>
          ) : (
            <div className="card flat small">
              Aucun e-mail : vous partagez vous-même le lien de la page du devis (SMS, messagerie…). Il s'affichera dans
              le suivi.
            </div>
          )}
        </div>

        <aside className="send-aside">
          <div className="card pad">
            <Totals quote={quote} />
          </div>
          <SendActions quote={quote} byEmail={byEmail} run={run} />
          <a className="btn ghost" href={`/apercu/${quote.id}`}>
            Aperçu du document
          </a>
        </aside>
      </div>
    </div>
  );
}

function ScheduleCard({
  quote,
  onSave,
}: {
  quote: QuoteDetail;
  onSave: (update: { startDate?: string | null; duration?: string }) => void;
}) {
  const [duration, setDuration] = useState(quote.duration);
  const locked = quote.status !== "draft" && quote.status !== "ready";
  return (
    <div className="card field-row">
      <label className="field">
        <span>Début des travaux</span>
        <input
          type="date"
          disabled={locked}
          value={quote.startDate ?? ""}
          onChange={(e) => onSave({ startDate: e.target.value || null })}
        />
      </label>
      <label className="field">
        <span>Durée estimée</span>
        <input
          disabled={locked}
          value={duration}
          placeholder="4 jours"
          onChange={(e) => setDuration(e.target.value)}
          onBlur={() => duration.trim() !== quote.duration && onSave({ duration: duration.trim() })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </label>
    </div>
  );
}

function SendActions(props: {
  quote: QuoteDetail;
  byEmail: boolean;
  run: (action: () => Promise<QuoteDetail>) => Promise<boolean>;
}) {
  const { quote, byEmail, run } = props;
  const [busy, setBusy] = useState(false);

  if (quote.status !== "draft" && quote.status !== "ready") {
    return (
      <button className="btn pri" onClick={() => navigate({ name: "tracking", id: quote.id })}>
        Voir le suivi
      </button>
    );
  }

  /** Un brouillon complet est d'abord validé (« prêt »), puis envoyé : un seul geste pour l'artisan. */
  const sendNow = async () => {
    setBusy(true);
    const ready = quote.status === "ready" || (await run(() => api.changeStatus(quote.id, "ready")));
    const sent = ready && (await run(() => api.sendQuote(quote.id, byEmail)));
    setBusy(false);
    if (sent) navigate({ name: "tracking", id: quote.id });
  };

  const blocked = quote.issues.length > 0;
  return (
    <>
      <button
        className={`btn ${blocked || busy ? "dis" : "pri"}`}
        disabled={blocked || busy}
        onClick={() => void sendNow()}
      >
        {busy ? "Envoi…" : byEmail ? "Envoyer le devis" : "Créer le lien du devis"}
      </button>
      {blocked && <span className="small mut">Complétez d'abord : {quote.issues.join(" · ")}</span>}
      {quote.status === "ready" && (
        <button className="btn ghost" onClick={() => void run(() => api.changeStatus(quote.id, "draft"))}>
          Repasser en brouillon
        </button>
      )}
    </>
  );
}
