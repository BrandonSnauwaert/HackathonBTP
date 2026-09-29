import { useState } from "react";
import { api } from "../api/client";
import type { Company, QuoteDetail } from "../api/types";
import { Badge } from "../components/Badge";
import { Totals } from "../components/Totals";
import { formatCents } from "../format";
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
 * E4 — Envoi : contrôle des mentions obligatoires, date de début et durée, puis validation du devis.
 * L'envoi réel de l'e-mail n'existe pas encore côté serveur : le devis passe seulement « prêt à envoyer ».
 */
export function SendScreen({ quoteId, company }: { quoteId: string; company: Company | null }) {
  const { quote, error, run } = useQuote(quoteId);
  if (!quote) return <p className="loading">{error ?? "Chargement…"}</p>;

  const list = mentions(quote, company);
  const okCount = list.filter((m) => m.ok).length;
  const message =
    `Bonjour ${quote.client.name}, voici le devis ${quote.title ? `pour « ${quote.title} » ` : ""}` +
    `d'un montant de ${formatCents(quote.totals.totalTtcCents)} TTC. Je reste disponible pour toute question.` +
    (company?.name ? ` ${company.name}` : "");

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
          </div>

          <ScheduleCard quote={quote} onSave={(update) => void run(() => api.updateQuote(quote.id, update))} />

          <div className="b">Envoyer par e-mail</div>
          <div className="card flat small">
            « {message} »<span className="mut">Le client recevra un lien « Voir le devis ».</span>
          </div>
        </div>

        <aside className="send-aside">
          <div className="card pad">
            <Totals quote={quote} />
          </div>
          <SendActions quote={quote} run={run} />
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

function SendActions({ quote, run }: { quote: QuoteDetail; run: (a: () => Promise<QuoteDetail>) => Promise<boolean> }) {
  if (quote.status === "draft") {
    return (
      <button
        className={`btn ${quote.issues.length > 0 ? "dis" : "pri"}`}
        disabled={quote.issues.length > 0}
        onClick={() => void run(() => api.changeStatus(quote.id, "ready"))}
      >
        Valider le devis
      </button>
    );
  }
  if (quote.status === "ready") {
    return (
      <>
        <div className="card w small">
          <span className="b">Devis prêt à envoyer.</span>
          L'envoi par e-mail n'est pas encore branché sur le serveur.
        </div>
        <button className="btn dis" disabled>
          Envoyer le devis · bientôt
        </button>
        <button className="btn ghost" onClick={() => void run(() => api.changeStatus(quote.id, "draft"))}>
          Repasser en brouillon
        </button>
      </>
    );
  }
  return (
    <button className="btn pri" onClick={() => navigate({ name: "tracking", id: quote.id })}>
      Voir le suivi
    </button>
  );
}
