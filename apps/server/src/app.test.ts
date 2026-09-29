/**
 * Test d'intégration de l'API : parcours complet sur une base SQLite en mémoire.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { parseConfig } from "./config.js";
import { openDatabase } from "./db/database.js";
import { mockLineExtractor, type LineExtractor } from "./llm/line-extractor.js";

const clipsDir = mkdtempSync(join(tmpdir(), "clips-"));
const config = parseConfig({ DATABASE_PATH: ":memory:", CLIPS_DIR: clipsDir, TRANSCRIBER: "mock", LLM_PROVIDER: "mock" });
const sampleWav = readFileSync(new URL("../samples/chantier-fr.wav", import.meta.url));

/**
 * Extracteur de test : échoue si `failNext`, attend `gate` s'il est posé (LLM lent), sinon délègue au mock.
 */
const flakyExtractor: LineExtractor & { failNext: boolean; gate: Promise<void> | null } = {
  failNext: false,
  gate: null,
  async extract(input) {
    if (this.gate) await this.gate;
    if (this.failNext) {
      this.failNext = false;
      throw new Error("LLM indisponible");
    }
    return mockLineExtractor.extract(input);
  },
};

let app: FastifyInstance;

before(async () => {
  app = await buildApp({ config, db: openDatabase(":memory:"), logger: false, extractor: flakyExtractor });
});
after(async () => {
  await app.close();
  rmSync(clipsDir, { recursive: true, force: true });
});

/** Crée un compte et renvoie une fonction de requête authentifiée. */
async function signUp(email: string) {
  const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: { email, password: "motdepasse" } });
  assert.equal(res.statusCode, 201, res.body);
  const cookie = res.cookies.find((c) => c.name === "sid");
  assert.ok(cookie, "cookie de session posé");
  const cookies = { sid: cookie.value };
  const request = (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, cookies, ...(payload ? { payload } : {}) });
  return Object.assign(request, { cookies });
}

describe("API", () => {
  it("refuse l'accès sans session", async () => {
    const res = await app.inject({ method: "GET", url: "/api/quotes" });
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error, "unauthorized");
  });

  it("gère inscription, connexion et doublons", async () => {
    await signUp("login@test.fr");
    const dup = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "LOGIN@test.fr", password: "motdepasse" },
    });
    assert.equal(dup.statusCode, 409);

    const bad = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "login@test.fr", password: "mauvais-mdp" },
    });
    assert.equal(bad.statusCode, 401);

    const ok = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "login@test.fr", password: "motdepasse" },
    });
    assert.equal(ok.statusCode, 200);
  });

  it("déroule le parcours d'un devis : création, lignes, totaux, validation", async () => {
    const api = await signUp("artisan@test.fr");

    // Devis créé avec un nouveau client
    const created = await api("POST", "/api/quotes", {
      client: { name: "Mme Durand", email: "durand@example.com" },
      title: "Rénovation cuisine",
      siteAddress: "12 rue des Lilas, 69003 Lyon",
    });
    assert.equal(created.statusCode, 201, created.body);
    const quote = created.json();
    assert.match(quote.number, /^D-\d{4}-0001$/);
    assert.equal(quote.status, "draft");
    assert.equal(quote.statusLabel, "Brouillon");
    assert.equal(quote.validityDays, 30, "validité par défaut du profil");

    // Lignes : une avec prix, une sans
    await api("POST", `/api/quotes/${quote.id}/lines`, {
      description: "Remplacement porte de cuisine",
      room: "Cuisine",
      quantity: 1,
      unit: "u",
      unitPriceCents: 45000,
      vatRateBp: 1000,
    });
    const withLines = await api("POST", `/api/quotes/${quote.id}/lines`, {
      description: "Ragréage du sol",
      quantity: 12,
      unit: "m2",
    });
    assert.equal(withLines.statusCode, 201, withLines.body);
    let detail = withLines.json();
    assert.equal(detail.lines.length, 2);
    assert.equal(detail.lines[1].vatRateBp, 2000, "TVA par défaut");
    assert.equal(detail.lines[1].unitLabel, "m²");
    assert.equal(detail.totals.unpricedLineCount, 1);

    // Incomplet : profil entreprise vide et prix manquant
    let res = await api("POST", `/api/quotes/${quote.id}/status`, { status: "ready" });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error, "quote_incomplete");
    const issues: string[] = res.json().details.issues;
    assert.ok(issues.some((i) => i.includes("SIRET")));
    assert.ok(issues.some((i) => i.includes("sans prix")));

    // On complète
    res = await api("PATCH", "/api/company", {
      name: "Martin Rénovation",
      address: "3 avenue du Chantier, 69000 Lyon",
      siret: "12345678900012",
      vatNumber: "FR12123456789",
      insurerName: "Assurance Exemple",
    });
    assert.equal(res.statusCode, 200, res.body);
    const lineId = detail.lines[1].id;
    res = await api("PATCH", `/api/quotes/${quote.id}/lines/${lineId}`, { unitPriceCents: 2500, vatRateBp: 1000 });
    detail = res.json();
    assert.equal(detail.totals.totalHtCents, 75000);
    assert.equal(detail.totals.totalTtcCents, 82500);
    assert.deepEqual(detail.issues, []);

    // Prêt, puis une modification le repasse en brouillon
    res = await api("POST", `/api/quotes/${quote.id}/status`, { status: "ready" });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().status, "ready");
    res = await api("PATCH", `/api/quotes/${quote.id}`, { notes: "Accès par la cour" });
    assert.equal(res.json().status, "draft");

    // Réordonner puis supprimer une ligne
    const ids: string[] = res.json().lines.map((l: { id: string }) => l.id);
    res = await api("PUT", `/api/quotes/${quote.id}/lines/order`, { lineIds: [...ids].reverse() });
    assert.equal(res.json().lines[0].description, "Ragréage du sol");
    res = await api("DELETE", `/api/quotes/${quote.id}/lines/${ids[1]}`);
    assert.equal(res.json().lines.length, 1);
    assert.equal(res.json().lines[0].position, 1);

    // Liste avec totaux
    res = await api("GET", "/api/quotes");
    const list = res.json();
    assert.equal(list.length, 1);
    assert.equal(list[0].client.name, "Mme Durand");
    assert.equal(list[0].totalHtCents, 45000);

    // Historique
    res = await api("GET", `/api/quotes/${quote.id}`);
    const types = res.json().events.map((e: { type: string; toStatus: string | null }) => `${e.type}:${e.toStatus}`);
    assert.deepEqual(types, ["created:draft", "status_changed:ready", "status_changed:draft"]);

    // Un client avec des devis ne se supprime pas
    res = await api("DELETE", `/api/clients/${quote.client.id}`);
    assert.equal(res.statusCode, 409);

    // Suppression du devis, puis du client
    res = await api("DELETE", `/api/quotes/${quote.id}`);
    assert.equal(res.statusCode, 204);
    res = await api("DELETE", `/api/clients/${quote.client.id}`);
    assert.equal(res.statusCode, 204);
  });

  it("refuse les statuts non manuels et les transitions invalides", async () => {
    const api = await signUp("statuts@test.fr");
    const quote = (await api("POST", "/api/quotes", { client: { name: "Client" } })).json();

    let res = await api("POST", `/api/quotes/${quote.id}/status`, { status: "sent" });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "status_not_manual");

    res = await api("POST", `/api/quotes/${quote.id}/status`, { status: "accepted" });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error, "invalid_transition");
  });

  it("valide les entrées", async () => {
    const api = await signUp("validation@test.fr");
    let res = await api("POST", "/api/quotes", {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "validation");

    const quote = (await api("POST", "/api/quotes", { client: { name: "Client" } })).json();
    res = await api("POST", `/api/quotes/${quote.id}/lines`, { description: "x", quantity: -1, unit: "u" });
    assert.equal(res.statusCode, 400);
    res = await api("POST", `/api/quotes/${quote.id}/lines`, { description: "x", quantity: 1, unit: "u", vatRateBp: 1500 });
    assert.equal(res.statusCode, 400, "taux de TVA inexistant");
  });

  it("isole les données entre artisans", async () => {
    const alice = await signUp("alice@test.fr");
    const bob = await signUp("bob@test.fr");
    const quote = (await alice("POST", "/api/quotes", { client: { name: "Client d'Alice" } })).json();

    assert.equal((await bob("GET", `/api/quotes/${quote.id}`)).statusCode, 404);
    assert.equal((await bob("GET", `/api/clients/${quote.client.id}`)).statusCode, 404);
    assert.equal((await bob("GET", "/api/quotes")).json().length, 0);
    const res = await bob("POST", "/api/quotes", { clientId: quote.client.id });
    assert.equal(res.statusCode, 404, "impossible d'utiliser le client d'un autre");
  });

  it("numérote les devis à la suite", async () => {
    const api = await signUp("numeros@test.fr");
    const client = (await api("POST", "/api/clients", { name: "Client" })).json();
    const a = (await api("POST", "/api/quotes", { clientId: client.id })).json();
    const b = (await api("POST", "/api/quotes", { clientId: client.id })).json();
    assert.match(a.number, /-0001$/);
    assert.match(b.number, /-0002$/);
  });

  it("traite une dictée : transcription, extraction, lignes ajoutées", async () => {
    const api = await signUp("dictee@test.fr");
    const quote = (await api("POST", "/api/quotes", { client: { name: "Client" } })).json();
    const clientClipId = "7f1c1c1e-4a57-4c0e-9d5e-2b9a3f1e0c11";

    const res = await app.inject({
      method: "POST",
      url: `/api/quotes/${quote.id}/clips?wait=true&clientClipId=${clientClipId}`,
      headers: { "content-type": "audio/wav" },
      cookies: api.cookies,
      payload: sampleWav,
    });
    assert.equal(res.statusCode, 200, res.body);
    const clip = res.json();
    assert.equal(clip.status, "done");
    assert.ok(clip.transcript.length > 0);
    assert.ok(clip.durationMs > 15_000);
    assert.equal(clip.lineCount, 1);

    const detail = (await api("GET", `/api/quotes/${quote.id}`)).json();
    assert.equal(detail.lines.length, 1);
    assert.equal(detail.lines[0].source, "dictation");
    assert.equal(detail.lines[0].clipId, clip.id);
    assert.equal(detail.lines[0].unitPriceCents, null, "le prix reste à l'artisan");
    assert.equal(detail.clips.length, 1);

    // Renvoi du même clip (reprise après coupure) : pas de doublon
    const again = await app.inject({
      method: "POST",
      url: `/api/quotes/${quote.id}/clips?clientClipId=${clientClipId}`,
      headers: { "content-type": "audio/wav" },
      cookies: api.cookies,
      payload: sampleWav,
    });
    assert.equal(again.statusCode, 200);
    assert.equal(again.json().id, clip.id);
    assert.equal((await api("GET", `/api/quotes/${quote.id}/clips`)).json().length, 1);

    // Réécoute
    const audio = await api("GET", `/api/quotes/${quote.id}/clips/${clip.id}/audio`);
    assert.equal(audio.statusCode, 200);
    assert.equal(audio.headers["content-type"], "audio/wav");
    assert.equal(audio.rawPayload.toString("ascii", 0, 4), "RIFF");
  });

  it("marque une dictée en échec puis la relance sans refaire la transcription", async () => {
    const api = await signUp("echec@test.fr");
    const quote = (await api("POST", "/api/quotes", { client: { name: "Client" } })).json();
    flakyExtractor.failNext = true;

    const res = await app.inject({
      method: "POST",
      url: `/api/quotes/${quote.id}/clips?wait=true`,
      headers: { "content-type": "audio/wav" },
      cookies: api.cookies,
      payload: sampleWav,
    });
    const failed = res.json();
    assert.equal(failed.status, "failed");
    assert.equal(failed.error, "LLM indisponible");
    assert.ok(failed.transcript, "la transcription est conservée");

    const retried = await api("POST", `/api/quotes/${quote.id}/clips/${failed.id}/retry`);
    assert.equal(retried.statusCode, 202, retried.body);
    let clip = retried.json();
    for (let i = 0; i < 50 && clip.status !== "done"; i++) {
      await new Promise((r) => setTimeout(r, 20));
      clip = (await api("GET", `/api/quotes/${quote.id}/clips/${failed.id}`)).json();
    }
    assert.equal(clip.status, "done");
    assert.equal(clip.transcript, failed.transcript);

    const again = await api("POST", `/api/quotes/${quote.id}/clips/${failed.id}/retry`);
    assert.equal(again.statusCode, 409, "une dictée traitée ne se relance pas");
  });

  it("enchaîne les transcriptions sans attendre le LLM, en gardant l'ordre des dictées", async () => {
    const api = await signUp("pipeline@test.fr");
    const quote = (await api("POST", "/api/quotes", { client: { name: "Client" } })).json();
    const upload = (clientClipId: string) =>
      app.inject({
        method: "POST",
        url: `/api/quotes/${quote.id}/clips?clientClipId=${clientClipId}`,
        headers: { "content-type": "audio/wav" },
        cookies: api.cookies,
        payload: sampleWav,
      });
    const clip = async (id: string) => (await api("GET", `/api/quotes/${quote.id}/clips/${id}`)).json();
    const until = async (check: () => Promise<boolean>) => {
      for (let i = 0; i < 100 && !(await check()); i++) await new Promise((r) => setTimeout(r, 20));
    };

    let releaseLlm = () => {};
    flakyExtractor.gate = new Promise((resolve) => (releaseLlm = resolve));
    try {
      const first = (await upload("11111111-1111-4111-8111-111111111111")).json();
      const second = (await upload("22222222-2222-4222-8222-222222222222")).json();

      // Le LLM est bloqué sur la 1re dictée : la 2e doit quand même être transcrite.
      await until(async () => (await clip(second.id)).status === "transcribed");
      assert.equal((await clip(second.id)).status, "transcribed");
      assert.ok((await clip(second.id)).transcript);
      assert.equal((await clip(first.id)).status, "extracting");

      releaseLlm();
      flakyExtractor.gate = null;
      await until(async () => (await clip(second.id)).status === "done");

      const lines = (await api("GET", `/api/quotes/${quote.id}`)).json().lines as { clipId: string }[];
      assert.deepEqual(
        lines.map((l) => l.clipId),
        [first.id, second.id],
        "les lignes suivent l'ordre des dictées",
      );
    } finally {
      releaseLlm();
      flakyExtractor.gate = null;
    }
  });

  it("refuse un audio invalide", async () => {
    const api = await signUp("audio@test.fr");
    const quote = (await api("POST", "/api/quotes", { client: { name: "Client" } })).json();
    const res = await app.inject({
      method: "POST",
      url: `/api/quotes/${quote.id}/clips`,
      headers: { "content-type": "audio/wav" },
      cookies: api.cookies,
      payload: Buffer.from("ceci n'est pas un wav"),
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "invalid_audio");
  });

  it("expose la doc OpenAPI", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    assert.equal(res.statusCode, 200);
    const spec = res.json();
    assert.ok(spec.paths["/api/quotes/{id}/lines"]);
    assert.ok(spec.components.schemas.QuoteDetail);
  });
});
