/**
 * Test d'intégration de l'API : parcours complet sur une base SQLite en mémoire.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { parseConfig } from "./config.js";
import { openDatabase } from "./db/database.js";
import { mockLineExtractor, type LineExtractor } from "./llm/line-extractor.js";

const clipsDir = mkdtempSync(join(tmpdir(), "clips-"));
const photosDir = mkdtempSync(join(tmpdir(), "photos-"));
const config = parseConfig({
  DATABASE_PATH: ":memory:",
  CLIPS_DIR: clipsDir,
  PHOTOS_DIR: photosDir,
  MAX_PHOTO_MB: "1",
  TRANSCRIBER: "mock",
  LLM_PROVIDER: "mock",
});
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
  rmSync(photosDir, { recursive: true, force: true });
});

/** Début d'un vrai fichier JPEG (signature FF D8 FF) : le serveur ne décode pas l'image. */
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("photo de chantier")]);

/** Crée un compte et renvoie une fonction de requête authentifiée. */
async function signUp(email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, password: "motdepasse" },
  });
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
    res = await api("POST", `/api/quotes/${quote.id}/lines`, {
      description: "x",
      quantity: 1,
      unit: "u",
      vatRateBp: 1500,
    });
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

  it("gère les photos : ajout, renvoi sans doublon, fichier, légende, suppression", async () => {
    const api = await signUp("photos@test.fr");
    const quote = (await api("POST", "/api/quotes", { client: { name: "Client" } })).json();
    const clientPhotoId = "33333333-3333-4333-8333-333333333333";
    const upload = (payload: Buffer, query = `clientPhotoId=${clientPhotoId}`, contentType = "image/jpeg") =>
      app.inject({
        method: "POST",
        url: `/api/quotes/${quote.id}/photos?${query}`,
        headers: { "content-type": contentType },
        cookies: api.cookies,
        payload,
      });

    const created = await upload(jpeg);
    assert.equal(created.statusCode, 201, created.body);
    const photo = created.json();
    assert.equal(photo.mimeType, "image/jpeg");
    assert.equal(photo.visibleToClient, false, "note interne par défaut");
    assert.equal(photo.url, `/api/quotes/${quote.id}/photos/${photo.id}/file`);

    // Renvoi de la même photo après une coupure : pas de doublon
    const again = await upload(jpeg);
    assert.equal(again.statusCode, 200);
    assert.equal(again.json().id, photo.id);
    assert.equal((await api("GET", `/api/quotes/${quote.id}`)).json().photos.length, 1);

    // Fichier servi avec le bon type, identique à l'envoi
    const file = await api("GET", photo.url);
    assert.equal(file.statusCode, 200);
    assert.equal(file.headers["content-type"], "image/jpeg");
    assert.deepEqual(file.rawPayload, jpeg);

    const updated = await api("PATCH", `/api/quotes/${quote.id}/photos/${photo.id}`, {
      caption: "Porte gondolée",
      visibleToClient: true,
    });
    assert.equal(updated.json().caption, "Porte gondolée");
    assert.equal(updated.json().visibleToClient, true);

    const removed = await api("DELETE", `/api/quotes/${quote.id}/photos/${photo.id}`);
    assert.equal(removed.statusCode, 204);
    assert.equal((await api("GET", `/api/quotes/${quote.id}/photos`)).json().length, 0);
    assert.equal(readdirSync(photosDir).includes(`${photo.id}.jpg`), false, "fichier supprimé du disque");
  });

  it("refuse les photos invalides ou trop lourdes, les isole par artisan et les supprime avec le devis", async () => {
    const api = await signUp("photos-refus@test.fr");
    const quote = (await api("POST", "/api/quotes", { client: { name: "Client" } })).json();
    const upload = (payload: Buffer, contentType = "image/jpeg") =>
      app.inject({
        method: "POST",
        url: `/api/quotes/${quote.id}/photos`,
        headers: { "content-type": contentType },
        cookies: api.cookies,
        payload,
      });

    // Un fichier qui n'est pas une image, même annoncé comme tel
    let res = await upload(Buffer.from("<script>alert(1)</script>"));
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "invalid_image");

    // Plus lourd que MAX_PHOTO_MB (1 Mo dans ces tests)
    res = await upload(Buffer.concat([jpeg, Buffer.alloc(1024 * 1024)]));
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "photo_too_large");

    // Un autre artisan ne voit ni la liste, ni les fichiers
    const photo = (await upload(jpeg)).json();
    const other = await signUp("photos-autre@test.fr");
    assert.equal((await other("GET", `/api/quotes/${quote.id}/photos`)).statusCode, 404);
    assert.equal((await other("GET", photo.url)).statusCode, 404);

    // Supprimer le devis supprime aussi les fichiers des photos
    assert.equal(existsSync(join(photosDir, `${photo.id}.jpg`)), true);
    assert.equal((await api("DELETE", `/api/quotes/${quote.id}`)).statusCode, 204);
    assert.equal(existsSync(join(photosDir, `${photo.id}.jpg`)), false);
  });

  describe("envoi et page client", () => {
    /** Artisan avec un profil complet et un devis prêt à envoyer (une ligne chiffrée). */
    async function readyQuote(email: string) {
      const api = await signUp(email);
      await api("PATCH", "/api/company", {
        name: "Martin Rénovation",
        legalForm: "SARL",
        address: "3 avenue du Chantier, 69000 Lyon",
        siret: "12345678900012",
        vatNumber: "FR12123456789",
        insurerName: "Assurance Exemple",
      });
      const quote = (
        await api("POST", "/api/quotes", {
          client: { name: "Mme Durand", email: "durand@example.com" },
          title: "Cuisine",
          notes: "Note interne : chien méchant",
        })
      ).json();
      await api("POST", `/api/quotes/${quote.id}/lines`, {
        description: "Remplacement porte",
        quantity: 1,
        unit: "u",
        unitPriceCents: 45000,
        vatRateBp: 1000,
      });
      return { api, quote };
    }
    const tokenOf = (publicUrl: string) => publicUrl.split("/d/")[1] ?? "";
    const publicApi = (method: "GET" | "POST", path: string, payload?: object) =>
      app.inject({ method, url: `/api/public/quotes/${path}`, ...(payload ? { payload } : {}) });

    it("n'envoie qu'un devis prêt, puis le fige et donne son lien", async () => {
      const { api, quote } = await readyQuote("envoi@test.fr");
      let res = await api("POST", `/api/quotes/${quote.id}/send`);
      assert.equal(res.statusCode, 409);
      assert.equal(res.json().error, "quote_not_ready");

      await api("POST", `/api/quotes/${quote.id}/status`, { status: "ready" });
      res = await api("POST", `/api/quotes/${quote.id}/send`);
      assert.equal(res.statusCode, 200, res.body);
      const sent = res.json();
      assert.equal(sent.status, "sent");
      assert.ok(sent.sentAt);
      assert.match(sent.publicUrl, /^http:\/\/localhost:5173\/d\/[A-Za-z0-9_-]{20,}$/);

      res = await api("PATCH", `/api/quotes/${quote.id}`, { title: "Modifié" });
      assert.equal(res.statusCode, 409, "un devis envoyé n'est plus modifiable");
      assert.equal((await api("GET", `/api/quotes/${quote.id}`)).json().publicUrl, sent.publicUrl);
    });

    it("ouvre la page client : document sans données internes, passage en « consulté »", async () => {
      const { api, quote } = await readyQuote("page@test.fr");
      // Deux photos : une partagée avec le client, une privée
      const upload = () =>
        app.inject({
          method: "POST",
          url: `/api/quotes/${quote.id}/photos`,
          headers: { "content-type": "image/jpeg" },
          cookies: api.cookies,
          payload: jpeg,
        });
      const shared = (await upload()).json();
      const hidden = (await upload()).json();
      await api("PATCH", `/api/quotes/${quote.id}/photos/${shared.id}`, { visibleToClient: true, caption: "Avant" });

      // Aperçu de l'artisan avant envoi : pas de suivi, pas de réponse possible
      const preview = (await api("GET", `/api/quotes/${quote.id}/document`)).json();
      assert.equal(preview.preview, true);
      assert.equal(preview.canRespond, false);

      await api("POST", `/api/quotes/${quote.id}/status`, { status: "ready" });
      const token = tokenOf((await api("POST", `/api/quotes/${quote.id}/send`)).json().publicUrl);

      const res = await publicApi("GET", token);
      assert.equal(res.statusCode, 200, res.body);
      const doc = res.json();
      assert.equal(doc.status, "viewed");
      assert.equal(doc.canRespond, true);
      assert.equal(doc.company.siret, "12345678900012");
      assert.equal(doc.company.insurerName, "Assurance Exemple");
      assert.equal(doc.totals.totalTtcCents, 49500);
      assert.equal(doc.lines[0].description, "Remplacement porte");
      assert.deepEqual(
        doc.photos.map((p: { caption: string }) => p.caption),
        ["Avant"],
        "seule la photo partagée est visible",
      );
      assert.equal(res.body.includes("chien méchant"), false, "les notes internes ne sortent pas");
      assert.equal("clips" in doc || "issues" in doc || "events" in doc, false);

      // Photos : partagée accessible sans connexion, privée introuvable
      assert.equal((await app.inject({ method: "GET", url: doc.photos[0].url })).statusCode, 200);
      assert.equal((await publicApi("GET", `${token}/photos/${hidden.id}`)).statusCode, 404);

      // Une seconde ouverture ne rajoute pas d'événement
      await publicApi("GET", token);
      const detail = (await api("GET", `/api/quotes/${quote.id}`)).json();
      assert.ok(detail.viewedAt);
      assert.equal(detail.events.filter((e: { type: string }) => e.type === "viewed").length, 1);
    });

    it("pixel : note l'ouverture de l'e-mail sans changer le statut", async () => {
      const { api, quote } = await readyQuote("pixel@test.fr");
      await api("POST", `/api/quotes/${quote.id}/status`, { status: "ready" });
      const token = tokenOf((await api("POST", `/api/quotes/${quote.id}/send`)).json().publicUrl);

      const res = await publicApi("GET", `${token}/pixel.gif`);
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers["content-type"], "image/gif");
      const detail = (await api("GET", `/api/quotes/${quote.id}`)).json();
      assert.equal(detail.status, "sent", "le pixel ne vaut pas consultation");
      assert.ok(detail.events.some((e: { type: string }) => e.type === "email_opened"));

      // Lien inconnu : l'image est quand même renvoyée (rien à apprendre pour un curieux)
      assert.equal((await publicApi("GET", "inconnu-inconnu-inconnu/pixel.gif")).statusCode, 200);
    });

    it("accepte le devis une seule fois, avec le nom du client", async () => {
      const { api, quote } = await readyQuote("accord@test.fr");
      await api("POST", `/api/quotes/${quote.id}/status`, { status: "ready" });
      const token = tokenOf((await api("POST", `/api/quotes/${quote.id}/send`)).json().publicUrl);

      let res = await publicApi("POST", `${token}/accept`, {});
      assert.equal(res.statusCode, 400, "le nom vaut signature : obligatoire");

      res = await publicApi("POST", `${token}/accept`, { name: "Sophie Durand", message: "Parfait, merci" });
      assert.equal(res.statusCode, 200, res.body);
      assert.equal(res.json().status, "accepted");
      assert.equal(res.json().canRespond, false);

      const detail = (await api("GET", `/api/quotes/${quote.id}`)).json();
      assert.equal(detail.status, "accepted");
      assert.equal(detail.response.name, "Sophie Durand");
      assert.equal(detail.response.message, "Parfait, merci");

      res = await publicApi("POST", `${token}/decline`, {});
      assert.equal(res.statusCode, 409);
      assert.equal(res.json().error, "already_answered");
    });

    it("refuse un lien inconnu ou mal formé", async () => {
      assert.equal((await publicApi("GET", "abcdefghijklmnopqrstuvwxyz")).statusCode, 404);
      assert.equal((await publicApi("GET", "trop-court")).statusCode, 400);
    });
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
