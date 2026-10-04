import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";

// L'envoi au serveur est simulé : seul le comportement de la file est testé ici.
const uploadClip = vi.fn();
const createQuote = vi.fn();
const updateClient = vi.fn();
vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client")>()),
  api: {
    uploadClip: (...args: unknown[]) => uploadClip(...args),
    createQuote: (...args: unknown[]) => createQuote(...args),
    updateClient: (...args: unknown[]) => updateClient(...args),
  },
}));

type Queue = typeof import("./clipQueue");
type Visits = typeof import("./pendingVisits");
let queue: Queue;
let visits: Visits;

const offline = () => new ApiError(0, { error: "network", message: "Serveur injoignable" });
const refused = () => new ApiError(409, { error: "quote_locked", message: "Ce devis a déjà été envoyé" });

const clip = (quoteId: string, recordedAt: string) => ({
  quoteId,
  wav: new Blob([new Uint8Array(44)], { type: "audio/wav" }),
  durationMs: 2000,
  recordedAt: new Date(recordedAt),
});

/** Laisse l'envoi lancé en tâche de fond (enqueueClip, retryQueued) se terminer. */
const settled = () => queue.syncIdle();

beforeEach(async () => {
  // Base IndexedDB vierge et module rechargé : chaque test part d'une file vide.
  globalThis.indexedDB = new IDBFactory();
  try {
    localStorage.clear();
  } catch {
    // Pas de localStorage dans cet environnement : les visites restent en mémoire.
  }
  vi.resetModules();
  uploadClip.mockReset();
  createQuote.mockReset();
  updateClient.mockReset();
  queue = await import("./clipQueue");
  visits = await import("./pendingVisits");
});

describe("file des dictées hors connexion", () => {
  it("envoie une dictée puis la retire de la file", async () => {
    uploadClip.mockResolvedValue({});
    const sent: string[] = [];
    queue.onClipSent((quoteId) => sent.push(quoteId));

    await queue.enqueueClip(clip("q1", "2026-09-30T10:00:00Z"));
    await vi.waitFor(() => expect(queue.queueState().clips).toHaveLength(0));

    expect(uploadClip).toHaveBeenCalledOnce();
    const [quoteId, wav, clientClipId] = uploadClip.mock.calls[0] ?? [];
    expect(quoteId).toBe("q1");
    expect(wav).toBeInstanceOf(Blob);
    expect(clientClipId).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent).toEqual(["q1"]);
  });

  it("garde les dictées sans réseau et s'arrête à la première coupure", async () => {
    uploadClip.mockRejectedValue(offline());

    await queue.enqueueClip(clip("q1", "2026-09-30T10:00:00Z"));
    await settled();
    await queue.enqueueClip(clip("q1", "2026-09-30T10:01:00Z"));
    await settled();

    expect(queue.queueState().online).toBe(false);
    expect(queue.queueState().clips.map((c) => c.error)).toEqual([null, null]);
    // Une tentative par synchronisation : la 2e dictée n'est pas essayée après la coupure.
    expect(uploadClip).toHaveBeenCalledTimes(2);
  });

  it("envoie tout au retour du réseau, dans l'ordre des dictées, avec le même identifiant", async () => {
    uploadClip.mockRejectedValue(offline());
    await queue.enqueueClip(clip("q1", "2026-09-30T10:05:00Z"));
    await settled();
    await queue.enqueueClip(clip("q1", "2026-09-30T10:00:00Z"));
    await settled();
    const ids = queue.queueState().clips.map((c) => c.clientClipId);

    uploadClip.mockReset();
    uploadClip.mockResolvedValue({});
    await queue.syncClips();

    expect(queue.queueState().clips).toEqual([]);
    expect(queue.queueState().online).toBe(true);
    // La plus ancienne d'abord ; le même clientClipId rend le renvoi sans risque de doublon.
    expect(uploadClip.mock.calls.map((call) => call[2])).toEqual(ids);
    expect(uploadClip.mock.calls.map((call) => (call[3] as Date).toISOString())).toEqual([
      "2026-09-30T10:00:00.000Z",
      "2026-09-30T10:05:00.000Z",
    ]);
  });

  it("met de côté une dictée refusée par le serveur sans bloquer les suivantes", async () => {
    uploadClip.mockRejectedValue(offline());
    await queue.enqueueClip(clip("q-locked", "2026-09-30T10:00:00Z"));
    await settled();
    await queue.enqueueClip(clip("q2", "2026-09-30T10:01:00Z"));
    await settled();

    uploadClip.mockReset();
    uploadClip.mockImplementation((quoteId: string) => (quoteId === "q-locked" ? Promise.reject(refused()) : {}));
    await queue.syncClips();

    const clips = queue.queueState().clips;
    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({ quoteId: "q-locked", error: "Ce devis a déjà été envoyé" });
    expect(uploadClip).toHaveBeenCalledTimes(2);

    // Une dictée en erreur n'est plus retentée seule...
    uploadClip.mockClear();
    await queue.syncClips();
    expect(uploadClip).not.toHaveBeenCalled();

    // ...mais l'artisan peut la renvoyer.
    uploadClip.mockResolvedValue({});
    await queue.retryQueued(clips[0]?.clientClipId ?? "");
    await vi.waitFor(() => expect(queue.queueState().clips).toEqual([]));
  });

  it("transmet le type d'enregistrement : segment d'écoute passive, dictée par défaut", async () => {
    uploadClip.mockResolvedValue({});
    await queue.enqueueClip({ ...clip("q1", "2026-09-30T10:00:00Z"), kind: "passive" });
    await settled();
    await queue.enqueueClip(clip("q1", "2026-09-30T10:05:00Z"));
    await settled();
    expect(uploadClip.mock.calls.map((call) => call[4])).toEqual(["passive", "dictation"]);
  });

  it("retrouve les dictées en attente après un redémarrage de l'application", async () => {
    uploadClip.mockRejectedValue(offline());
    await queue.enqueueClip(clip("q1", "2026-09-30T10:00:00Z"));
    await settled();

    // Même base IndexedDB, module rechargé : comme une page rouverte sur le chantier.
    vi.resetModules();
    const reopened: Queue = await import("./clipQueue");
    uploadClip.mockReset();
    uploadClip.mockResolvedValue({});
    await reopened.syncClips();
    expect(reopened.queueState().clips).toEqual([]);
    expect(uploadClip).toHaveBeenCalledOnce();
  });
});

describe("visite commencée hors connexion", () => {
  const newVisit = { who: { client: { name: "Mme Martin" } }, clientName: "Mme Martin", title: "", siteAddress: "" };

  it("crée le devis au retour du réseau, puis envoie ses dictées vers lui", async () => {
    uploadClip.mockResolvedValue({});
    createQuote.mockRejectedValue(offline());
    const visit = visits.createLocalVisit(newVisit);
    expect(visits.isLocalQuoteId(visit.localId)).toBe(true);
    expect(visits.placeholderQuote(visit)).toMatchObject({ id: visit.localId, client: { name: "Mme Martin" } });

    await queue.enqueueClip(clip(visit.localId, "2026-09-30T10:00:00Z"));
    await settled();
    // Hors connexion : ni devis, ni envoi de dictée vers un identifiant local.
    expect(uploadClip).not.toHaveBeenCalled();
    expect(queue.queueState().clips).toHaveLength(1);

    const created: string[][] = [];
    visits.onVisitCreated((localId, quoteId) => created.push([localId, quoteId]));
    createQuote.mockReset();
    createQuote.mockResolvedValue({ id: "q-real" });
    await queue.syncClips();

    expect(createQuote).toHaveBeenCalledWith(newVisit.who, "", "");
    expect(uploadClip.mock.calls.map((call) => call[0])).toEqual(["q-real"]);
    expect(queue.queueState().clips).toEqual([]);
    expect(visits.hasPendingVisits()).toBe(false);
    expect(visits.createdQuoteId(visit.localId)).toBe("q-real");
    expect(created).toEqual([[visit.localId, "q-real"]]);

    // Segment arrivé après la création (écoute passive arrêtée ensuite) : directement vers le vrai devis.
    await queue.enqueueClip(clip(visit.localId, "2026-09-30T10:05:00Z"));
    await settled();
    expect(uploadClip.mock.calls.map((call) => call[0])).toEqual(["q-real", "q-real"]);
  });

  it("garde la visite et ses dictées si le serveur refuse la création", async () => {
    uploadClip.mockResolvedValue({});
    createQuote.mockRejectedValue(new ApiError(400, { error: "validation", message: "Nom du client obligatoire" }));
    const visit = visits.createLocalVisit(newVisit);
    await queue.enqueueClip(clip(visit.localId, "2026-09-30T10:00:00Z"));
    await settled();

    expect(visits.findPendingVisit(visit.localId)?.error).toBe("Nom du client obligatoire");
    expect(uploadClip).not.toHaveBeenCalled();
    expect(queue.queueState().clips).toHaveLength(1);
  });
});
