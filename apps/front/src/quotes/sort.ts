import type { QuoteSummary } from "../api/types";
import { activityDate } from "./status";

/** Tri de la liste des devis (accueil). */

/** Par défaut : les relances à faire d'abord (action attendue), puis la dernière activité. */
export type SortId = "priority" | "amount-desc" | "amount-asc" | "activity-desc" | "activity-asc";

export const SORTS: { id: SortId; label: string }[] = [
  { id: "priority", label: "À relancer d'abord" },
  { id: "activity-desc", label: "Activité : récente d'abord" },
  { id: "activity-asc", label: "Activité : ancienne d'abord" },
  { id: "amount-desc", label: "Montant TTC : décroissant" },
  { id: "amount-asc", label: "Montant TTC : croissant" },
];

const byActivity = (a: QuoteSummary, b: QuoteSummary) => activityDate(b).localeCompare(activityDate(a));

export function compare(sort: SortId): (a: QuoteSummary, b: QuoteSummary) => number {
  switch (sort) {
    case "priority":
      return (a, b) => Number(b.reminderDue) - Number(a.reminderDue) || byActivity(a, b);
    case "activity-desc":
      return byActivity;
    case "activity-asc":
      return (a, b) => byActivity(b, a);
    case "amount-desc":
      return (a, b) => b.totalTtcCents - a.totalTtcCents || byActivity(a, b);
    case "amount-asc":
      return (a, b) => a.totalTtcCents - b.totalTtcCents || byActivity(a, b);
  }
}

/** Clic sur un en-tête de colonne : décroissant, puis croissant, puis retour au tri par défaut. */
export function nextSort(current: SortId, column: "amount" | "activity"): SortId {
  if (current === `${column}-desc`) return `${column}-asc`;
  if (current === `${column}-asc`) return "priority";
  return `${column}-desc`;
}
