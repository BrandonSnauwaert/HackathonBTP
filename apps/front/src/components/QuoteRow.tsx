import type { ReactNode } from "react";
import type { QuoteSummary } from "../api/types";
import { formatCents, formatRelative } from "../format";
import { openQuote } from "../quotes/status";
import { StatusBadge } from "./Badge";

function activity(q: QuoteSummary): string {
  if (q.remindedAt && q.status === "follow_up") return `Relancé ${formatRelative(q.remindedAt)}`;
  if (q.status === "sent" && q.sentAt) return `Envoyé ${formatRelative(q.sentAt)}`;
  return `Mis à jour ${formatRelative(q.updatedAt)}`;
}

/**
 * Ligne d'une liste de devis : carte sur téléphone, ligne de tableau sur ordinateur.
 * `name` : libellé de la 1re colonne ; `action` : bouton de la dernière colonne (relance…).
 * La ligne entière ouvre le devis ; le bouton d'action garde son propre clic.
 */
export function QuoteRow({ quote, name, action }: { quote: QuoteSummary; name: string; action?: ReactNode }) {
  return (
    <div
      className="qrow card"
      role="link"
      tabIndex={0}
      onClick={() => openQuote(quote)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) openQuote(quote);
      }}
    >
      <span className="q-name b">{name}</span>
      <span className="q-amount b r">{formatCents(quote.totalTtcCents)}</span>
      <span className="q-status">
        <StatusBadge status={quote.status} label={quote.statusLabel} />
      </span>
      <span className="q-activity mut small">{activity(quote)}</span>
      <span className="q-action">{action}</span>
    </div>
  );
}
