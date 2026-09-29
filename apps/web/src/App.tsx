import { useState } from "react";
import LiveTranscription from "./live/LiveTranscription";
import TestConsole from "./test-console/TestConsole";

type Tab = "quotes" | "live";

/** Pages de test (en attendant les maquettes UI/UX). */
export default function App() {
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
