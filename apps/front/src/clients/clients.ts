import type { Client, QuoteSummary } from "../api/types";
import { activityDate } from "../quotes/status";

const WAITING = new Set(["sent", "viewed", "follow_up"]);
const MAX_SUGGESTIONS = 5;

/** Texte comparable sans accents ni casse : « lefevre » trouve « M. Lefèvre ». */
export const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Clients dont le nom, l'e-mail, le téléphone ou l'adresse contient la recherche (tous si elle est vide). */
export function searchClients(clients: readonly Client[], search: string): Client[] {
  const query = normalize(search);
  return clients.filter((c) => [c.name, c.email, c.phone, c.address].some((field) => normalize(field).includes(query)));
}

/** Suggestions de « Nouvelle visite » : sur le nom ou l'e-mail, dès la première lettre, 5 au plus. */
export function suggestClients(clients: readonly Client[], typed: string): Client[] {
  const query = normalize(typed);
  if (query === "") return [];
  return clients
    .filter((c) => normalize(c.name).includes(query) || normalize(c.email).includes(query))
    .slice(0, MAX_SUGGESTIONS);
}

/** Adresse du client (sur plusieurs lignes) → champ « Adresse du chantier » (une ligne). */
export const oneLine = (address: string) =>
  address
    .split("\n")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");

export interface ClientStats {
  /** Ses devis, de la dernière activité à la plus ancienne. */
  quotes: QuoteSummary[];
  acceptedHtCents: number;
  /** Envoyés, consultés ou à relancer. */
  waiting: number;
  /** Dernière activité sur l'un de ses devis, ou création de la fiche. */
  lastActivity: string;
}

export function clientStats(client: Client, quotes: readonly QuoteSummary[]): ClientStats {
  const own = quotes
    .filter((q) => q.client.id === client.id)
    .sort((a, b) => activityDate(b).localeCompare(activityDate(a)));
  return {
    quotes: own,
    acceptedHtCents: own.filter((q) => q.status === "accepted").reduce((sum, q) => sum + q.totalHtCents, 0),
    waiting: own.filter((q) => WAITING.has(q.status)).length,
    lastActivity: own[0] ? activityDate(own[0]) : client.updatedAt,
  };
}
