/**
 * Exporte la doc OpenAPI de l'API dans openapi.json (versionné), sans lancer de serveur.
 * Le front en génère ses types (npm run api:types dans apps/web).
 *
 *   npm run openapi            → écrit openapi.json puis régénère les types du front
 *   tsx scripts/export-openapi.ts --check   → échoue si openapi.json n'est pas à jour (hook git)
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import { parseConfig } from "../src/config.js";
import { openDatabase } from "../src/db/database.js";

const OUTPUT = new URL("../openapi.json", import.meta.url);
const clipsDir = mkdtempSync(join(tmpdir(), "openapi-"));
const config = parseConfig({
  DATABASE_PATH: ":memory:",
  CLIPS_DIR: clipsDir,
  TRANSCRIBER: "mock",
  LLM_PROVIDER: "mock",
});
const app = await buildApp({ config, db: openDatabase(":memory:"), logger: false });
await app.ready();
const spec = `${JSON.stringify(app.swagger(), null, 2)}\n`;
await app.close();
rmSync(clipsDir, { recursive: true, force: true });

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(OUTPUT, "utf8").replace(/\r\n/g, "\n");
  } catch {
    // fichier absent : considéré comme pas à jour
  }
  if (current !== spec) {
    console.error("openapi.json n'est pas à jour avec l'API : lancer `npm run openapi` dans apps/server.");
    process.exit(1);
  }
  console.log("openapi.json à jour");
} else {
  writeFileSync(OUTPUT, spec);
  console.log("openapi.json écrit");
}
