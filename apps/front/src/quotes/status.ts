import type { QuoteDetail, QuoteLine, QuoteStatus } from "../api/types";
import { navigate } from "../router";

/** Couleur du badge : bleu = en cours, vert = gagné, jaune = action attendue, gris = neutre. */
export type Tone = "bl" | "ok" | "w" | "gy" | "sg";

export const STATUS_TONE: Record<QuoteStatus, Tone> = {
  draft: "gy",
  ready: "bl",
  sent: "gy",
  viewed: "bl",
  follow_up: "w",
  accepted: "ok",
  declined: "gy",
  expired: "gy",
};

export const STATUS_ICON: Record<QuoteStatus, string> = {
  draft: "✎",
  ready: "✓",
  sent: "◌",
  viewed: "◉",
  follow_up: "↻",
  accepted: "✓",
  declined: "✕",
  expired: "⌛",
};

export const isEditable = (status: QuoteStatus) => status === "draft" || status === "ready";

/** Filtres de la liste des devis (accueil). */
export const FILTERS = [
  { id: "all", label: "Tous", statuses: null },
  { id: "draft", label: "Brouillons", statuses: ["draft", "ready"] },
  { id: "follow_up", label: "À relancer", statuses: ["follow_up"] },
  { id: "viewed", label: "Consultés", statuses: ["viewed"] },
  { id: "accepted", label: "Acceptés", statuses: ["accepted"] },
  { id: "lost", label: "Perdus", statuses: ["declined", "expired"] },
] as const satisfies readonly { id: string; label: string; statuses: readonly QuoteStatus[] | null }[];

export type FilterId = (typeof FILTERS)[number]["id"];

/** Une ligne est « à vérifier » tant qu'elle n'a pas de prix. */
export const needsReview = (line: QuoteLine) => line.unitPriceCents === null;

/** Lignes regroupées par pièce (« lot » dans la maquette), dans l'ordre d'apparition. */
export function groupByRoom(lines: readonly QuoteLine[]): { room: string; lines: QuoteLine[]; totalHtCents: number }[] {
  const groups = new Map<string, QuoteLine[]>();
  for (const line of lines) {
    const room = line.room.trim() || "Général";
    groups.set(room, [...(groups.get(room) ?? []), line]);
  }
  return [...groups].map(([room, grouped]) => ({
    room,
    lines: grouped,
    totalHtCents: grouped.reduce((sum, line) => sum + (line.totalHtCents ?? 0), 0),
  }));
}

/** Avertissements des dictées (quantités, dimensions manquantes...), sans doublon. */
export const clipWarnings = (quote: QuoteDetail) => [...new Set(quote.clips.flatMap((clip) => clip.warnings))];

/** « Salle de bain — Mme Durand » */
export const quoteName = (q: { title: string; client: { name: string } }) =>
  q.title ? `${q.title} — ${q.client.name}` : q.client.name;

/** Un brouillon s'ouvre sur l'édition, un devis envoyé sur son suivi. */
export const openQuote = (q: { id: string; status: QuoteStatus }) =>
  navigate({ name: isEditable(q.status) ? "quote" : "tracking", id: q.id });
