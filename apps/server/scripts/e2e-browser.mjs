// Test E2E : Chrome headless avec micro simulé (fichier WAV), clique sur le micro et lit la transcription affichée.
// Usage : node scripts/e2e-browser.mjs <url-front> <fichier.wav> <durée-ms>
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import WebSocket from "ws";

const [url = "http://localhost:5173", wav = "samples/chantier-fr.wav", duration = "12000"] = process.argv.slice(2);
const chrome = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const proc = spawn(chrome, [
  "--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${mkdtempSync(join(tmpdir(), "e2e-"))}`,
  "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
  `--use-file-for-fake-audio-capture=${resolve(wav)}`, "--autoplay-policy=no-user-gesture-required", "about:blank",
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 30 && !target; i++) {
  await sleep(300);
  try { target = (await (await fetch("http://127.0.0.1:9333/json")).json()).find((t) => t.type === "page"); } catch {}
}
const cdp = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => cdp.on("open", r));
let id = 0; const pending = new Map();
cdp.on("message", (d) => { const m = JSON.parse(d); pending.get(m.id)?.(m.result); pending.delete(m.id); });
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); cdp.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }))?.result?.value;

await send("Page.navigate", { url });
await sleep(2000);
await evaluate(`document.querySelector(".mic").click()`);
await sleep(Number(duration));
console.log("statut :", await evaluate(`document.querySelector(".status").textContent`));
console.log("erreur :", await evaluate(`document.querySelector(".error")?.textContent ?? "aucune"`));
const lines = await evaluate(
  `[...document.querySelectorAll(".segment")].map(e => (e.classList.contains("partial") ? "(partiel) " : "") + e.textContent)`,
);
console.log("transcription :");
for (const line of lines ?? []) console.log("  " + line);
cdp.close(); proc.kill();
