import { useState } from "react";
import LiveTranscription from "./live/LiveTranscription";
import PublicQuotePage from "./public-quote/PublicQuotePage";
import TestConsole from "./test-console/TestConsole";

type Tab = "quotes" | "live";

/**
 * Routage minimal (pas de bibliothèque) :
 * - /d/<secret>      page du devis pour le client (lien envoyé par e-mail)
 * - /apercu/<id>     aperçu de ce même document par l'artisan
 * - le reste         pages de test, en attendant les maquettes UI/UX
 */
export default function App() {
  const publicToken = /^\/d\/([A-Za-z0-9_-]+)\/?$/.exec(location.pathname)?.[1];
  if (publicToken) return <PublicQuotePage source={{ kind: "public", token: publicToken }} />;
  const previewId = /^\/apercu\/([0-9a-f-]{36})\/?$/.exec(location.pathname)?.[1];
  if (previewId) return <PublicQuotePage source={{ kind: "preview", quoteId: previewId }} />;
  return <TestPages />;
}

function TestPages() {
  const [tab, setTab] = useState<Tab>("quotes");

  return (
    <>
      <nav className="tabs">
        <button className={tab === "quotes" ? "active" : ""} onClick={() => setTab("quotes")}>
          Devis &amp; dictées
        </button>
        <button className={tab === "live" ? "active" : ""} onClick={() => setTab("live")}>
          Transcription live
        </button>
        <a href="/docs" target="_blank" rel="noreferrer">
          Doc API ↗
        </a>
      </nav>
      {tab === "quotes" ? <TestConsole /> : <LiveTranscription />}
    </>
  );
}
