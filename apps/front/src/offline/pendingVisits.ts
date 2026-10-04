import { useSyncExternalStore } from "react";
import { ApiError, api } from "../api/client";
import type { QuoteDetail } from "../api/types";

/**
 * Visites commencées sans réseau : le devis ne peut pas être créé sur le serveur, la visite démarre
 * quand même sous un identifiant local (`local-…`). Les dictées s'accumulent dans la file du téléphone
 * sous cet identifiant ; au retour du réseau, le devis est créé, puis les dictées lui sont rattachées
 * (cf. clipQueue.ts) et l'écran ouvert bascule sur le vrai devis.
 *
 * Gardées dans localStorage (quelques champs de texte) : elles survivent à la fermeture de l'app.
 */

export interface PendingVisit {
  localId: string;
  who: Parameters<typeof api.createQuote>[0];
  /** Client existant dont l'e-mail ou le téléphone ont été corrigés : mis à jour à la création. */
  clientUpdate?: { email: string; phone: string };
  clientName: string;
  title: string;
  siteAddress: string;
  createdAt: string;
  /** Refus du serveur (pas une coupure réseau) : la visite attend une correction. */
  error: string | null;
}

export type NewVisit = Omit<PendingVisit, "localId" | "createdAt" | "error">;

const VISITS_KEY = "devis-vocal:pending-visits";
/** Identifiant local → identifiant du devis créé, pour rediriger un écran ou un lien resté sur l'ancien. */
const CREATED_KEY = "devis-vocal:created-visits";
const LOCAL_PREFIX = "local-";

export const isLocalQuoteId = (id: string) => id.startsWith(LOCAL_PREFIX);

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Stockage indisponible : la visite ne survivra pas à la fermeture de l'app.
  }
}

let visits: PendingVisit[] = read<PendingVisit[]>(VISITS_KEY, []);
let created: Record<string, string> = read<Record<string, string>>(CREATED_KEY, {});
const listeners = new Set<() => void>();

function save(next: PendingVisit[]) {
  visits = next;
  write(VISITS_KEY, visits);
  listeners.forEach((listener) => listener());
}

/** Devis affiché pendant la visite hors connexion, avant que le serveur ne le crée. */
export function placeholderQuote(visit: PendingVisit): QuoteDetail {
  const clientId = "clientId" in visit.who ? visit.who.clientId : visit.localId;
  const contact: { email?: string; phone?: string } =
    "client" in visit.who ? visit.who.client : (visit.clientUpdate ?? {});
  return {
    id: visit.localId,
    number: "Hors connexion",
    status: "draft",
    statusLabel: "Brouillon",
    title: visit.title,
    siteAddress: visit.siteAddress,
    validityDays: 30,
    validUntil: null,
    startDate: null,
    duration: "",
    paymentTerms: "",
    notes: "",
    sentAt: null,
    createdAt: visit.createdAt,
    updatedAt: visit.createdAt,
    client: {
      id: clientId,
      name: visit.clientName,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      address: "",
      createdAt: visit.createdAt,
      updatedAt: visit.createdAt,
    },
    lines: [],
    totals: {
      totalHtCents: 0,
      vatBreakdown: [],
      totalVatCents: 0,
      totalTtcCents: 0,
      unpricedLineCount: 0,
      vatExempt: false,
      vatMention: null,
    },
    issues: [],
    allowedTransitions: [],
    clips: [],
    photos: [],
    publicUrl: null,
    response: null,
    viewedAt: null,
    remindedAt: null,
    reminderDue: false,
    events: [],
  };
}

/** Commence une visite sans réseau ; renvoie son identifiant local. */
export function createLocalVisit(visit: NewVisit): PendingVisit {
  const pending: PendingVisit = {
    ...visit,
    localId: `${LOCAL_PREFIX}${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    error: null,
  };
  save([...visits, pending]);
  return pending;
}

export const findPendingVisit = (localId: string) => visits.find((v) => v.localId === localId) ?? null;

/** Identifiant du devis créé pour une visite locale (null tant qu'il ne l'est pas). */
export const createdQuoteId = (localId: string): string | null => created[localId] ?? null;

export const hasPendingVisits = () => visits.some((v) => v.error === null);

/**
 * Crée sur le serveur les visites commencées hors connexion, dans l'ordre.
 * `onCreated` rattache ce qui attendait la visite (dictées) avant qu'elle ne quitte la liste.
 * Renvoie false à la première coupure réseau.
 */
export async function syncVisits(onCreated: (localId: string, quote: QuoteDetail) => Promise<void>): Promise<boolean> {
  visits = read<PendingVisit[]>(VISITS_KEY, visits);
  for (const visit of visits.filter((v) => v.error === null)) {
    try {
      if (visit.clientUpdate && "clientId" in visit.who) {
        await api.updateClient(visit.who.clientId, visit.clientUpdate);
      }
      const quote = await api.createQuote(visit.who, visit.title, visit.siteAddress);
      created = { ...created, [visit.localId]: quote.id };
      write(CREATED_KEY, created);
      await onCreated(visit.localId, quote);
      save(visits.filter((v) => v.localId !== visit.localId));
      createdListeners.forEach((listener) => listener(visit.localId, quote.id));
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) return false;
      const error = err instanceof Error ? err.message : "Création du devis refusée";
      save(visits.map((v) => (v.localId === visit.localId ? { ...v, error } : v)));
    }
  }
  return true;
}

/** Remet une visite refusée dans la file de création. */
export function retryPendingVisit(localId: string) {
  save(visits.map((v) => (v.localId === localId ? { ...v, error: null } : v)));
}

// --- Abonnements

const createdListeners = new Set<(localId: string, quoteId: string) => void>();

/** Prévient quand le devis d'une visite locale vient d'être créé (l'écran ouvert bascule dessus). */
export function onVisitCreated(listener: (localId: string, quoteId: string) => void): () => void {
  createdListeners.add(listener);
  return () => createdListeners.delete(listener);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function usePendingVisits(): PendingVisit[] {
  return useSyncExternalStore(subscribe, () => visits);
}
