import { useSyncExternalStore } from "react";
import { ApiError, api } from "../api/client";
import type { ClipKind } from "../api/types";
import { createdQuoteId, hasPendingVisits, isLocalQuoteId, syncVisits } from "./pendingVisits";

/**
 * File d'attente des dictées, pour travailler sans réseau (caves, sous-sols, zones blanches).
 *
 * Chaque dictée est d'abord écrite dans IndexedDB sur le téléphone, puis envoyée au serveur.
 * Sans réseau, elle reste dans la file et part au retour de la connexion (événement `online`,
 * démarrage de l'app, puis nouvel essai régulier : iOS n'a pas de Background Sync).
 * L'identifiant `clientClipId` rend le renvoi sans risque : le serveur ignore un doublon.
 */

export interface QueuedClip {
  clientClipId: string;
  quoteId: string;
  wav: Blob;
  durationMs: number;
  recordedAt: Date;
  /** Absent pour les dictées enregistrées avant l'écoute passive : dictée talkie-walkie. */
  kind?: ClipKind;
  /** Refus du serveur (pas une coupure réseau) : la dictée attend un renvoi manuel. */
  error: string | null;
}

export interface QueueState {
  clips: QueuedClip[];
  online: boolean;
  /** Envoi en cours (dictée concernée). */
  sending: string | null;
}

const DB_NAME = "devis-vocal";
const STORE = "clips";
const RETRY_MS = 5_000;

let state: QueueState = { clips: [], online: navigator.onLine, sending: null };
const listeners = new Set<() => void>();

function setState(patch: Partial<QueueState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

// --- IndexedDB (API native, enveloppée dans des promesses)

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "clientClipId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB indisponible"));
  });
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = action(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Erreur IndexedDB"));
  });
}

async function reload() {
  const clips = await tx<QueuedClip[]>("readonly", (store) => store.getAll() as IDBRequest<QueuedClip[]>);
  clips.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  setState({ clips });
}

// --- Envoi

/** Un seul passage d'envoi à la fois. */
async function syncOnce(): Promise<void> {
  try {
    // Relue à chaque fois : la file stockée sur le téléphone fait foi (page rouverte, autre onglet).
    await reload();
    // Visites commencées hors connexion : leur devis est créé d'abord, leurs dictées lui sont rattachées.
    if (!(await syncVisits(reassignClips))) {
      setState({ online: false });
      return;
    }
    await reload();
    // Une dictée d'une visite dont la création a été refusée attend la correction de la visite.
    for (const clip of state.clips.filter((c) => c.error === null && !isLocalQuoteId(c.quoteId))) {
      setState({ sending: clip.clientClipId });
      try {
        await api.uploadClip(clip.quoteId, clip.wav, clip.clientClipId, clip.recordedAt, clip.kind ?? "dictation");
        await tx("readwrite", (store) => store.delete(clip.clientClipId));
        setState({ online: true });
        notifySent(clip.quoteId);
      } catch (err) {
        if (err instanceof ApiError && err.status === 0) {
          setState({ online: false });
          break;
        }
        // Refus du serveur (devis envoyé entre-temps, fichier invalide...) : on garde la dictée.
        const error = err instanceof Error ? err.message : "Envoi refusé";
        await tx("readwrite", (store) => store.put({ ...clip, error }));
      }
    }
  } finally {
    setState({ sending: null });
    await reload();
  }
}

/** Rattache au devis créé les dictées enregistrées pendant une visite hors connexion. */
async function reassignClips(localId: string, quote: { id: string }): Promise<void> {
  const clips = await tx<QueuedClip[]>("readonly", (store) => store.getAll() as IDBRequest<QueuedClip[]>);
  for (const clip of clips.filter((c) => c.quoteId === localId)) {
    await tx("readwrite", (store) => store.put({ ...clip, quoteId: quote.id }));
  }
}

let running: Promise<void> | null = null;
let rerun = false;

/**
 * Crée les visites commencées hors connexion, puis envoie les dictées en attente, dans l'ordre ;
 * s'arrête à la première coupure réseau.
 * Demandé pendant un envoi (nouvelle dictée, retour du réseau), un nouveau passage suit aussitôt.
 */
export function syncClips(): Promise<void> {
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    do {
      rerun = false;
      await syncOnce();
    } while (rerun);
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Se résout quand aucun envoi n'est en cours (tests). */
export const syncIdle = (): Promise<void> => running ?? Promise.resolve();

/** Ajoute une dictée à la file, puis tente l'envoi. */
export async function enqueueClip(clip: Omit<QueuedClip, "clientClipId" | "error">): Promise<void> {
  // Visite hors connexion dont le devis vient d'être créé : la dictée part directement vers lui.
  const quoteId = isLocalQuoteId(clip.quoteId) ? (createdQuoteId(clip.quoteId) ?? clip.quoteId) : clip.quoteId;
  await tx("readwrite", (store) => store.put({ ...clip, quoteId, clientClipId: crypto.randomUUID(), error: null }));
  await reload();
  void syncClips();
}

/** Remet une dictée refusée dans la file (ou la supprime). */
export async function retryQueued(clientClipId: string): Promise<void> {
  const clip = state.clips.find((c) => c.clientClipId === clientClipId);
  if (!clip) return;
  await tx("readwrite", (store) => store.put({ ...clip, error: null }));
  await reload();
  void syncClips();
}

export async function discardQueued(clientClipId: string): Promise<void> {
  await tx("readwrite", (store) => store.delete(clientClipId));
  await reload();
}

// --- Abonnements

const sentListeners = new Set<(quoteId: string) => void>();
const notifySent = (quoteId: string) => sentListeners.forEach((listener) => listener(quoteId));

/** Prévient quand une dictée est arrivée sur le serveur (pour recharger le devis). */
export function onClipSent(listener: (quoteId: string) => void): () => void {
  sentListeners.add(listener);
  return () => sentListeners.delete(listener);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useClipQueue(): QueueState {
  return useSyncExternalStore(subscribe, () => state);
}

/** État courant de la file, hors React (tests). */
export const queueState = (): QueueState => state;

/** À appeler une fois au démarrage : relit la file et l'envoie au retour du réseau. */
export function startClipSync() {
  window.addEventListener("online", () => {
    setState({ online: true });
    void syncClips();
  });
  window.addEventListener("offline", () => setState({ online: false }));
  // `online` n'est pas toujours émis (Wi-Fi présent mais sans Internet) : nouvel essai régulier.
  setInterval(() => {
    if (hasPendingVisits() || state.clips.some((c) => c.error === null)) void syncClips();
  }, RETRY_MS);
  void reload().then(syncClips, () => undefined);
}
