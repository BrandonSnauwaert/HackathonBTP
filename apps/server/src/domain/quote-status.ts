/**
 * Cycle de vie d'un devis (cf. CONTEXTE.md, « Cycle de vie d'un devis »).
 *
 *   draft ⇄ ready ──► sent ──► viewed ──► accepted / declined
 *                       └────────┴──► follow_up ──► accepted / declined
 *   sent / viewed / follow_up ──► expired (validité dépassée)
 */

export const QUOTE_STATUSES = [
  "draft",
  "ready",
  "sent",
  "viewed",
  "follow_up",
  "accepted",
  "declined",
  "expired",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Brouillon",
  ready: "Prêt à envoyer",
  sent: "Envoyé",
  viewed: "Consulté",
  follow_up: "À relancer",
  accepted: "Accepté",
  declined: "Refusé",
  expired: "Expiré",
};

/** Qui déclenche une transition : l'artisan dans l'app, le client sur la page du devis, ou le système. */
export type Actor = "artisan" | "client" | "system";

const RESPONSE: Partial<Record<QuoteStatus, readonly Actor[]>> = {
  accepted: ["client", "artisan"],
  declined: ["client", "artisan"],
  expired: ["system"],
};

const TRANSITIONS: Record<QuoteStatus, Partial<Record<QuoteStatus, readonly Actor[]>>> = {
  draft: { ready: ["artisan"] },
  ready: { draft: ["artisan"], sent: ["artisan"] },
  sent: { viewed: ["client"], follow_up: ["system"], ...RESPONSE },
  viewed: { follow_up: ["system"], ...RESPONSE },
  follow_up: { ...RESPONSE },
  accepted: {},
  declined: {},
  expired: {},
};

export function canTransition(from: QuoteStatus, to: QuoteStatus, actor: Actor): boolean {
  return TRANSITIONS[from][to]?.includes(actor) ?? false;
}

/** Statuts accessibles depuis `from` pour cet acteur (pour afficher les bons boutons). */
export function allowedTransitions(from: QuoteStatus, actor: Actor): QuoteStatus[] {
  return QUOTE_STATUSES.filter((to) => canTransition(from, to, actor));
}

/** Un devis envoyé est un document remis au client : on ne le modifie plus. */
export function isEditable(status: QuoteStatus): boolean {
  return status === "draft" || status === "ready";
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TimeBasedInput {
  status: QuoteStatus;
  sentAt: Date | null;
  validityDays: number;
  followUpAfterDays: number;
  now: Date;
}

/**
 * Statut automatique dû au temps qui passe (expiration, relance), ou null si rien ne change.
 * Appelé à la lecture des devis : pas besoin de tâche planifiée.
 */
export function timeBasedStatus(input: TimeBasedInput): QuoteStatus | null {
  const { status, sentAt, now } = input;
  if (sentAt === null) return null;
  const elapsed = now.getTime() - sentAt.getTime();

  if (elapsed >= input.validityDays * DAY_MS && canTransition(status, "expired", "system")) {
    return "expired";
  }
  if (elapsed >= input.followUpAfterDays * DAY_MS && canTransition(status, "follow_up", "system")) {
    return "follow_up";
  }
  return null;
}
