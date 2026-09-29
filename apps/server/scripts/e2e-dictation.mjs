// Test E2E de la page « Devis & dictées » : Chrome headless avec un micro simulé (fichier WAV).
// Se connecte au compte de démo, crée un devis, maintient le bouton talkie-walkie pendant la durée
// du fichier, puis affiche la transcription et les lignes ajoutées.
//
// Prérequis : serveur (3000) et front (5173) lancés, compte de démo créé (npm run seed:demo).
// Usage : node scripts/e2e-dictation.mjs [url-front] [fichier.wav] [durée-appui-ms]
// Variable optionnelle : SCREENSHOT=capture.png pour enregistrer une capture de la page à la fin.
import { writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import WebSocket from "ws";

const [url = "http://localhost:5173", wav = "samples/chantier-fr.wav", holdMs = "18500"] = process.argv.slice(2);
const chrome = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const proc = spawn(chrome, [
  "--headless=new", "--remote-debugging-port=9334", `--user-data-dir=${mkdtempSync(join(tmpdir(), "e2e-"))}`,
  "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
  `--use-file-for-fake-audio-capture=${resolve(wav)}%noloop`, "--window-size=1280,1000", "about:blank",
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 30 && !target; i++) {
  await sleep(300);
  try { target = (await (await fetch("http://127.0.0.1:9334/json")).json()).find((t) => t.type === "page"); } catch {}
}
const cdp = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => cdp.on("open", r));
let id = 0;
const pending = new Map();
cdp.on("message", (d) => { const m = JSON.parse(d); pending.get(m.id)?.(m.result); pending.delete(m.id); });
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); cdp.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }))?.result?.value;
const text = (selector) => evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].map(e => e.innerText.trim())`);

try {
  await send("Page.navigate", { url });
  await sleep(1500);
  if (await evaluate(`!!document.querySelector("form.login")`)) {
    await evaluate(`document.querySelector("form.login button[type=submit]").click()`);
    await sleep(1000);
  }

  const number = await evaluate(`fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client: { name: "Client E2E" }, title: "Dictée depuis le navigateur" }) })
    .then(r => r.json()).then(q => q.number)`);
  await send("Page.reload");
  await sleep(1500);
  await evaluate(`[...document.querySelectorAll(".quote-list button")].find(b => b.innerText.includes(${JSON.stringify(number)})).click()`);
  await sleep(800);
  console.log(`devis ${number} ouvert`);

  const box = await evaluate(`(() => { const r = document.querySelector(".talk-button").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await sleep(1000);
  console.log("pendant l'appui :", await text(".talk-hint"));
  await sleep(Number(holdMs) - 1000);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
  console.log("bouton relâché, traitement…");

  const seen = new Set();
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    const badges = await text(".clip .clip-head .badge");
    const status = badges.at(-1) ?? "(aucune dictée)";
    if (!seen.has(status)) { seen.add(status); console.log(`  ${i + 1} s : ${status}`); }
    if (status === "Traité" || status === "Échec" || status === "Envoi échoué") break;
  }
  console.log("\ntranscription :", (await text(".clip blockquote")).join(" | ") || "(aucune)");
  console.log("points manquants :", (await text(".clip .warnings li")).join(" | ") || "(aucun)");
  console.log("erreurs :", (await text(".error-text")).join(" | ") || "(aucune)");
  console.log("lignes :");
  for (const row of await text(".lines tbody tr")) console.log("  -", row.replace(/\s+/g, " "));
  if (process.env.SCREENSHOT) {
    const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    writeFileSync(process.env.SCREENSHOT, Buffer.from(data, "base64"));
    console.log("capture :", process.env.SCREENSHOT);
  }
} finally {
  cdp.close();
  proc.kill();
}
