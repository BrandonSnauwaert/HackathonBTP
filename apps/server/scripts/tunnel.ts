/**
 * Ouvre le tunnel HTTPS public vers le front (Cloudflare « quick tunnel », dans Docker).
 *
 *   npm run tunnel          → démarre le tunnel, affiche son adresse et un QR code pour le téléphone
 *   npm run tunnel -- stop  → ferme le tunnel
 *
 * L'adresse change à chaque lancement : elle est écrite dans TUNNEL_URL_FILE, que le serveur relit
 * pour les liens envoyés aux clients (pas besoin de le redémarrer). Prérequis : Docker, front lancé.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import qrcode from "qrcode-terminal";
import { config } from "../src/config.js";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/g;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function compose(...args: string[]): string {
  return execFileSync("docker", ["compose", ...args], { cwd: REPO_ROOT, encoding: "utf8", stdio: "pipe" });
}

if (process.argv.includes("stop")) {
  compose("--profile", "tunnel", "stop", "tunnel");
  rmSync(config.TUNNEL_URL_FILE, { force: true });
  console.log("Tunnel fermé. Les liens envoyés aux clients repointent sur http://localhost:5173.");
  process.exit(0);
}

console.log("Démarrage du tunnel...");
// Recréé à chaque fois : les logs ne contiennent alors que l'adresse du nouveau tunnel.
compose("--profile", "tunnel", "up", "-d", "--force-recreate", "tunnel");

let url: string | undefined;
for (let i = 0; i < 60 && !url; i++) {
  await sleep(1000);
  url = compose("--profile", "tunnel", "logs", "tunnel").match(URL_PATTERN)?.at(-1);
}
if (!url) {
  console.error("Adresse du tunnel introuvable après 60 s. Logs : docker compose --profile tunnel logs tunnel");
  process.exit(1);
}

mkdirSync(dirname(config.TUNNEL_URL_FILE), { recursive: true });
writeFileSync(config.TUNNEL_URL_FILE, `${url}\n`);

// Le nom de domaine du tunnel met quelques secondes à être joignable.
let reachable = false;
for (let i = 0; i < 30 && !reachable; i++) {
  try {
    reachable = (await fetch(`${url}/api/health`)).ok;
  } catch {
    // pas encore joignable
  }
  if (!reachable) await sleep(2000);
}

console.log(`\nTunnel ouvert : ${url}\n`);
qrcode.generate(url, { small: true });
console.log(
  reachable
    ? "Serveur et front joignables par le tunnel."
    : "Tunnel ouvert, mais l'app ne répond pas encore : vérifier que le serveur (npm run dev) et le front tournent.",
);
if (config.PUBLIC_BASE_URL) {
  console.log(`Attention : PUBLIC_BASE_URL=${config.PUBLIC_BASE_URL} dans .env est prioritaire sur le tunnel.`);
} else {
  console.log("Les liens des devis envoyés utilisent désormais cette adresse (sans redémarrer le serveur).");
}
console.log("Le tunnel tourne en arrière-plan. Pour le fermer : npm run tunnel -- stop");
