// Test E2E de l'application de l'artisan (apps/front) : Chrome headless piloté par le protocole DevTools,
// micro simulé par un fichier WAV. Vérifie les parcours qui ne se testent que dans un vrai navigateur :
// ajout et modification d'une ligne (enregistrée d'un coup), dictée hors connexion envoyée au retour du réseau, page rouverte
// sans réseau, aperçu de l'artisan qui ne compte pas comme une consultation, passage en « consulté »
// sans recharger, client existant proposé dans « Nouvelle visite » (sans doublon).
//
// Prérequis : serveur (3000) et front (5174) lancés, compte de démo (npm run seed:demo).
// Crée un client et deux devis « E2E … » sur le compte de démo (npm run seed:demo pour repartir de zéro).
// Usage : node scripts/e2e-front.mjs [url-front] [fichier.wav]
// Code de sortie 1 si une vérification échoue. SCREENSHOTS=dossier pour garder une capture par étape.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import WebSocket from "ws";

const [front = "http://localhost:5174", wav = "samples/chantier-fr.wav"] = process.argv.slice(2);
const chrome = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const shotsDir = process.env.SCREENSHOTS;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const proc = spawn(chrome, [
  "--headless=new",
  "--remote-debugging-port=9335",
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "e2e-front-"))}`,
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  `--use-file-for-fake-audio-capture=${resolve(wav)}`,
  "about:blank",
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Protocole DevTools

let target;
for (let i = 0; i < 30 && !target; i++) {
  await sleep(300);
  try {
    target = (await (await fetch("http://127.0.0.1:9335/json")).json()).find((t) => t.type === "page");
  } catch {
    // Chrome démarre encore
  }
}
if (!target) {
  console.error("Chrome injoignable (variable CHROME pour indiquer son chemin).");
  proc.kill();
  process.exit(1);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.once("open", r));
let nextId = 0;
const pending = new Map();
const pageErrors = [];
ws.on("message", (raw) => {
  const msg = JSON.parse(raw);
  if (msg.method === "Runtime.exceptionThrown") pageErrors.push(msg.params.exceptionDetails.exception?.description);
  pending.get(msg.id)?.(msg);
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const id = ++nextId;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });

/** Évalue une expression dans la page et renvoie sa valeur (promesses attendues). */
async function ev(expression) {
  const { result } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result?.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description ?? "erreur dans la page");
  return result?.result?.value;
}
const api = (path, method = "GET", body) =>
  ev(`fetch("/api${path}", {
    method: ${JSON.stringify(method)},
    headers: { "Content-Type": "application/json" },
    ${body ? `body: ${JSON.stringify(JSON.stringify(body))},` : ""}
  }).then((r) => r.json())`);
const setViewport = (width, height, mobile) =>
  send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
const setOffline = (offline) =>
  send("Network.emulateNetworkConditions", { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
/** Ouvre une adresse et recharge : la navigation par hash seule ne relance pas l'application. */
async function open(path) {
  await send("Page.navigate", { url: front + path });
  // Recharger avant que la navigation ait abouti la ferait annuler (page restée sur about:blank).
  await waitUntil(async () => (await ev("location.href")).startsWith(front), 5000, 100);
  await send("Page.reload");
  await sleep(2000);
}
const text = (selector) =>
  ev(`[...document.querySelectorAll(${JSON.stringify(selector)})].map((e) => e.textContent.trim()).join(" | ")`);
const clickText = (selector, label) =>
  ev(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.includes(${JSON.stringify(label)}));
    if (!el) throw new Error("introuvable : " + ${JSON.stringify(label)});
    el.click();
  })()`);
/** Saisie dans un champ de la fiche ouverte, repéré par son libellé (événement « input » de React). */
const fill = (label, value) =>
  ev(`(() => {
    const field = [...document.querySelectorAll(".sheet label.field")].find((l) => l.textContent.startsWith(${JSON.stringify(label)}));
    const input = field.querySelector("input, textarea");
    const proto = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
const centerOf = (selector) =>
  ev(
    `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
  );
const mouse = (type, { x, y }) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
async function realClick(point) {
  await mouse("mousePressed", point);
  await mouse("mouseReleased", point);
}
async function waitUntil(check, timeoutMs, stepMs = 500) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return true;
    await sleep(stepMs);
  }
  return false;
}

// --- Vérifications

let failures = 0;
let step = 0;
async function expectThat(label, ok, detail = "") {
  step++;
  console.log(`${ok ? "✓" : "✗"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
  if (shotsDir) {
    const { result } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(shotsDir, `${String(step).padStart(2, "0")}.png`), Buffer.from(result.data, "base64"));
  }
}

try {
  await send("Runtime.enable");
  await send("Network.enable");
  await setViewport(1280, 900, false);
  await open("/");
  const login = await api("/auth/login", "POST", { email: "demo@artisan.test", password: "demo1234" });
  if (!login.user) throw new Error(`connexion au compte de démo impossible : ${JSON.stringify(login)}`);

  const clientName = `E2E ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
  const quote = await api("/quotes", "POST", {
    client: { name: clientName, email: "e2e@example.com" },
    title: "Cuisine",
    siteAddress: "1 rue du Test",
  });
  console.log(`Devis ${quote.number} pour « ${clientName} »\n`);

  // 1. Ajout d'une ligne à la main
  await open(`/#/devis/${quote.id}`);
  await clickText("button", "+ Ajouter une ligne");
  await sleep(300);
  await fill("Désignation", "Pose d'une porte intérieure");
  await fill("Pièce", "Cuisine");
  await fill("Prix unitaire", "250");
  await clickText(".sheet button", "Ajouter la ligne");
  await sleep(1000);
  let detail = await api(`/quotes/${quote.id}`);
  const line = detail.lines[0];
  await expectThat(
    "ajout d'une ligne : désignation, pièce, prix et TVA enregistrés",
    detail.lines.length === 1 && line.room === "Cuisine" && line.unitPriceCents === 25_000 && line.vatRateBp === 1000,
    JSON.stringify(line),
  );

  // 2. Modification de plusieurs champs (vrai clavier) : rien n'est envoyé avant « Enregistrer »
  await ev(`document.querySelector(".line-main").click()`);
  await sleep(300);
  await realClick(await centerOf(".line-edit textarea"));
  await ev(`document.querySelector(".line-edit textarea").select()`);
  await send("Input.insertText", { text: "Pose d'une porte coulissante" });
  await clickText(".line-edit .seg button", "20");
  await realClick({ x: 700, y: 40 });
  await sleep(1000);
  detail = await api(`/quotes/${quote.id}`);
  await expectThat(
    "modification en cours : rien d'enregistré, ligne toujours ouverte",
    detail.lines[0]?.description === "Pose d'une porte intérieure" &&
      detail.lines[0]?.vatRateBp === 1000 &&
      (await ev(`!!document.querySelector(".line.open .line-edit")`)),
    JSON.stringify(detail.lines[0]),
  );
  await clickText(".line-edit button", "Enregistrer");
  await sleep(1000);
  detail = await api(`/quotes/${quote.id}`);
  await expectThat(
    "« Enregistrer » : désignation et TVA enregistrées ensemble, ligne refermée",
    detail.lines[0]?.description === "Pose d'une porte coulissante" &&
      detail.lines[0]?.vatRateBp === 2000 &&
      !(await ev(`!!document.querySelector(".line-edit")`)),
    JSON.stringify(detail.lines[0]),
  );

  // 3. Dictée hors connexion, gardée sur le téléphone puis envoyée au retour du réseau
  await setViewport(390, 844, true);
  await open(`/#/visite/${quote.id}`);
  await setOffline(true);
  await sleep(500);
  const talk = await centerOf(".btn.talk");
  await mouse("mousePressed", talk);
  await sleep(4000);
  await mouse("mouseReleased", talk);
  await sleep(1500);
  await expectThat(
    "hors connexion : dictée gardée, bandeau et carte « en attente »",
    (await text(".offline-banner")).includes("1 dictée en attente") && (await text(".card.queued")).length > 0,
    await text(".offline-banner"),
  );

  await send("Page.reload");
  await sleep(2500);
  await expectThat(
    "hors connexion : l'application rouverte affiche le devis et la dictée en attente",
    (await text("h1")).includes(clientName) && (await text(".offline-banner")).includes("1 dictée en attente"),
    `${await text("h1")} / ${await text(".offline-banner")}`,
  );

  await setOffline(false);
  const arrived = await waitUntil(async () => (await api(`/quotes/${quote.id}`)).clips.length === 1, 15_000);
  await expectThat("retour du réseau : la dictée arrive sur le serveur", arrived);
  await expectThat("retour du réseau : le bandeau disparaît", (await text(".offline-banner")) === "");

  // 4. Écoute passive : accord du client obligatoire, segment envoyé à l'arrêt, temps restant affiché
  await clickText(".btn.passive-btn", "Écoute");
  await sleep(300);
  const blockedWithoutConsent = await ev(
    `[...document.querySelectorAll(".sheet button")].find((b) => b.textContent.includes("Démarrer")).disabled`,
  );
  await ev(`document.querySelector(".sheet .consent input").click()`);
  await clickText(".sheet button", "Démarrer l'écoute");
  await sleep(4000);
  const listening = (await text(".passive-banner")).includes("Écoute en cours") && (await text(".sheet")) === "";
  await clickText(".btn.stop", "Arrêter l'écoute");
  const etaShown = await waitUntil(async () => (await text(".eta")).includes("Tout sera prêt dans"), 8000, 250);
  const passiveArrived = await waitUntil(
    async () => (await api(`/quotes/${quote.id}`)).clips.some((c) => c.kind === "passive"),
    15_000,
  );
  await expectThat(
    "écoute passive : accord du client exigé, écoute démarrée puis arrêtée, segment reçu par le serveur",
    blockedWithoutConsent === true && listening && passiveArrived,
    `sans accord : ${blockedWithoutConsent ? "bloqué" : "possible"}, écoute : ${listening}, reçu : ${passiveArrived}`,
  );
  await expectThat("écoute passive : temps restant affiché pendant le traitement", etaShown, await text(".eta"));
  await waitUntil(
    async () => (await api(`/quotes/${quote.id}`)).clips.every((c) => c.estimatedReadyAt === null),
    60_000,
  );

  // 5. Aperçu de l'artisan : ne compte pas comme une consultation
  await setViewport(1280, 900, false);
  await api(`/quotes/${quote.id}/status`, "POST", { status: "ready" });
  const sent = await api(`/quotes/${quote.id}/send`, "POST", { byEmail: false });
  if (sent.status !== "sent") throw new Error(`envoi impossible : ${JSON.stringify(sent)}`);
  await open(`/#/devis/${quote.id}/suivi`);
  await clickText("a", "Voir le devis");
  await sleep(2000);
  detail = await api(`/quotes/${quote.id}`);
  await expectThat(
    "« Voir le devis » depuis le suivi ouvre l'aperçu, sans passer le devis en « consulté »",
    (await ev("location.pathname")).startsWith("/apercu/") && detail.status === "sent" && detail.viewedAt === null,
    `${await ev("location.pathname")} / ${detail.status}`,
  );

  // 6. Le client ouvre son lien : le suivi passe en « consulté » sans recharger
  await open(`/#/devis/${quote.id}/suivi`);
  const token = sent.publicUrl.split("/d/")[1];
  await fetch(`${front}/api/public/quotes/${token}`);
  const viewed = await waitUntil(async () => (await text("header .bdg")).includes("Consulté"), 8000);
  await expectThat("suivi : « Consulté » affiché sans recharger la page", viewed, await text("header .bdg"));

  // 7. Client existant proposé dans « Nouvelle visite », sans doublon
  const clientsBefore = (await api("/clients")).length;
  await open("/#/");
  await clickText("button", "Nouvelle visite");
  await sleep(400);
  await fill("Client", clientName.slice(0, 12));
  await sleep(300);
  await clickText(".suggestions button", clientName);
  await sleep(300);
  const filledEmail = await ev(`document.querySelector(".sheet input[type=email]").value`);
  await clickText(".sheet button", "Commencer la visite");
  await sleep(1500);
  const newQuoteId = (await ev("location.hash")).split("/").pop();
  const newQuote = await api(`/quotes/${newQuoteId}`);
  await expectThat(
    "client existant : coordonnées remplies, devis rattaché à sa fiche, aucun doublon",
    filledEmail === "e2e@example.com" &&
      newQuote.client?.id === quote.client.id &&
      (await api("/clients")).length === clientsBefore,
    `e-mail « ${filledEmail} », client ${newQuote.client?.id} au lieu de ${quote.client.id}`,
  );

  await expectThat("aucune erreur JavaScript dans la page", pageErrors.length === 0, pageErrors.join(" / "));
} catch (err) {
  failures++;
  console.error(`✗ arrêt du test : ${err instanceof Error ? err.message : err}`);
} finally {
  ws.close();
  proc.kill();
}

console.log(failures === 0 ? "\nTout est bon." : `\n${failures} vérification(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
