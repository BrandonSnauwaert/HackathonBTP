import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createPublicUrlResolver } from "./public-url.js";

describe("createPublicUrlResolver", () => {
  const dir = mkdtempSync(join(tmpdir(), "tunnel-"));
  const file = join(dir, "tunnel-url.txt");

  it("prend l'adresse du tunnel, relue à chaque appel, sinon le front local", () => {
    const resolve = createPublicUrlResolver({ PUBLIC_BASE_URL: undefined, TUNNEL_URL_FILE: file });
    assert.equal(resolve(), "http://localhost:5174", "pas de tunnel");

    writeFileSync(file, "https://abc-def.trycloudflare.com\n");
    assert.equal(resolve(), "https://abc-def.trycloudflare.com");

    writeFileSync(file, "https://autre-adresse.trycloudflare.com/");
    assert.equal(resolve(), "https://autre-adresse.trycloudflare.com", "nouveau tunnel sans redémarrage");

    writeFileSync(file, "n'importe quoi");
    assert.equal(resolve(), "http://localhost:5174", "contenu invalide ignoré");
  });

  it("donne la priorité à PUBLIC_BASE_URL quand elle est définie", () => {
    writeFileSync(file, "https://abc-def.trycloudflare.com");
    const resolve = createPublicUrlResolver({ PUBLIC_BASE_URL: "https://devis.exemple.fr/", TUNNEL_URL_FILE: file });
    assert.equal(resolve(), "https://devis.exemple.fr");
    rmSync(dir, { recursive: true, force: true });
  });
});
