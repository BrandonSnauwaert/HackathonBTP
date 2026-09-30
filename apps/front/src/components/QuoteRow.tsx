import type { QuoteSummary } from "../api/types";
import { formatCents, formatRelative } from "../format";
import { openQuote } from "../quotes/status";
import { StatusBadge } from "./Badge";

function activity(q: QuoteSummary): string {
  if (q.status === "sent" && q.sentAt) return `Envoyé ${formatRelative(q.sentAt)}`;
  return `Mis à jour ${formatRelative(q.updatedAt)}`;
}

/** Ligne d'une liste de devis : carte sur téléphone, ligne de tableau sur ordinateur. `name` : libellé de la 1re colonne. */
export function QuoteRow({ quote, name }: { quote: QuoteSummary; name: string }) {
  return (
    <button className="qrow card" onClick={() => openQuote(quote)}>
      <span className="q-name b">{name}</span>
      <span className="q-amount b r">{formatCents(quote.totalTtcCents)}</span>
      <span className="q-status">
        <StatusBadge status={quote.status} label={quote.statusLabel} />
      </span>
      <span className="q-activity mut small">{activity(quote)}</span>
    </button>
  );
}
