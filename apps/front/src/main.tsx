import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { startClipSync } from "./offline/clipQueue";
import PublicQuotePage, { type PublicQuoteSource } from "./public-quote/PublicQuotePage";
import { applyTheme, initTheme } from "./theme";

/**
 * Deux applications sur la même origine :
 * - /d/<secret>   page du devis pour le client (lien de l'e-mail), sans connexion ;
 * - /apercu/<id>  aperçu de ce même document par l'artisan, sans suivi ;
 * - le reste      application de l'artisan (navigation par hash : #/devis/…).
 */
function publicSource(path: string): PublicQuoteSource | null {
  const token = /^\/d\/([A-Za-z0-9_-]{20,64})\/?$/.exec(path)?.[1];
  if (token) return { kind: "public", token };
  const quoteId = /^\/apercu\/([0-9a-f-]{36})\/?$/.exec(path)?.[1];
  if (quoteId) return { kind: "preview", quoteId };
  return null;
}

const source = publicSource(window.location.pathname);

if (source) {
  // Le devis est un document, imprimable tel quel : toujours en clair.
  applyTheme("light");
} else {
  initTheme();
  startClipSync();
  // Le service worker garde l'application en cache : elle s'ouvre même sans réseau, sur le chantier.
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>{source ? <PublicQuotePage source={source} /> : <App />}</StrictMode>,
);
