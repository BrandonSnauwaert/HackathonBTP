import { readFileSync } from "node:fs";
import type { Config } from "./config.js";

const LOCAL_FRONT_URL = "http://localhost:5174";

/**
 * Adresse publique du front, utilisée dans les liens envoyés aux clients (e-mail, page du devis).
 * Ordre de priorité :
 * 1. PUBLIC_BASE_URL si elle est définie (adresse fixe) ;
 * 2. l'adresse du tunnel en cours, écrite par `npm run tunnel` dans TUNNEL_URL_FILE (relue à chaque
 *    appel : le tunnel peut changer d'adresse sans redémarrer le serveur) ;
 * 3. le front local.
 */
export function createPublicUrlResolver(config: Pick<Config, "PUBLIC_BASE_URL" | "TUNNEL_URL_FILE">): () => string {
  return () => {
    if (config.PUBLIC_BASE_URL) return config.PUBLIC_BASE_URL.replace(/\/$/, "");
    try {
      const url = readFileSync(config.TUNNEL_URL_FILE, "utf8").trim();
      if (/^https:\/\/\S+$/.test(url)) return url.replace(/\/$/, "");
    } catch {
      // pas de tunnel en cours
    }
    return LOCAL_FRONT_URL;
  };
}
