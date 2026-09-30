import type { QuoteSummary } from "../api/types";

/**
 * Indicateurs du tableau de bord, calculés à partir de la liste des devis :
 * ce que l'outil apporte à l'artisan (il envoie, le client lit, le client signe, vite).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "short" });

export interface Funnel {
  sent: number;
  viewed: number;
  accepted: number;
}

export interface MonthRevenue {
  /** AAAA-MM */
  key: string;
  /** « sept. » */
  label: string;
  acceptedHtCents: number;
  count: number;
}

export interface DashboardStats {
  funnel: Funnel;
  /** Devis acceptés / devis envoyés, entre 0 et 1 ; null tant que rien n'est envoyé. */
  signatureRate: number | null;
  /** Devis consultés / devis envoyés. */
  viewRate: number | null;
  acceptedHtCents: number;
  /** Délai moyen entre l'envoi et la réponse du client, en jours ; null sans réponse. */
  avgResponseDays: number | null;
  /** Chiffre d'affaires signé par mois, du plus ancien au mois courant. */
  months: MonthRevenue[];
}

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const average = (values: number[]) =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

/** Un devis compte comme consulté s'il a été ouvert, ou s'il a reçu une réponse (acceptée à l'oral…). */
const wasViewed = (q: QuoteSummary) => q.viewedAt !== null || q.status === "accepted" || q.status === "declined";

export function dashboardStats(quotes: readonly QuoteSummary[], now = new Date(), monthCount = 6): DashboardStats {
  const sent = quotes.filter((q) => q.sentAt !== null);
  const accepted = sent.filter((q) => q.status === "accepted");
  const funnel = { sent: sent.length, viewed: sent.filter(wasViewed).length, accepted: accepted.length };

  const responseDays = sent
    .filter((q) => q.respondedAt !== null && q.sentAt !== null)
    .map((q) => (Date.parse(q.respondedAt ?? "") - Date.parse(q.sentAt ?? "")) / DAY_MS)
    .filter((days) => days >= 0);

  // Mois de la signature (réponse en ligne), sinon dernière modification (accord noté à la main).
  const months: MonthRevenue[] = Array.from({ length: monthCount }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1 - i), 1);
    return { key: monthKey(date), label: monthLabel.format(date), acceptedHtCents: 0, count: 0 };
  });
  for (const q of accepted) {
    const month = months.find((m) => m.key === monthKey(new Date(q.respondedAt ?? q.updatedAt)));
    if (month) {
      month.acceptedHtCents += q.totalHtCents;
      month.count += 1;
    }
  }

  return {
    funnel,
    signatureRate: sent.length === 0 ? null : accepted.length / sent.length,
    viewRate: sent.length === 0 ? null : funnel.viewed / sent.length,
    acceptedHtCents: accepted.reduce((sum, q) => sum + q.totalHtCents, 0),
    avgResponseDays: average(responseDays),
    months,
  };
}

/** « 42 % » ; « — » sans donnée. */
export const formatRate = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)} %`);

/** « moins d'un jour », « 1 jour », « 2,5 jours » ; « — » sans donnée. */
export function formatDays(days: number | null): string {
  if (days === null) return "—";
  if (days < 1) return "moins d'un jour";
  const rounded = Math.round(days * 2) / 2;
  return `${String(rounded).replace(".", ",")} jour${rounded >= 2 ? "s" : ""}`;
}
