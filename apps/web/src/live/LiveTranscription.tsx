import { useEffect, useRef, type CSSProperties } from "react";
import { useTranscription, type Status } from "./useTranscription";

const STATUS_LABEL: Record<Status, string> = {
  idle: "Prêt",
  connecting: "Connexion…",
  recording: "En écoute",
  error: "Erreur",
};

const timeFormat = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function LiveTranscription() {
  const { status, error, segments, partial, level, start, stop, clear } = useTranscription();
  const endRef = useRef<HTMLDivElement>(null);
  const recording = status === "recording";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [segments, partial]);

  return (
    <div className="app">
      <header className="header">
        <h1>Notes de chantier</h1>
        <span className={`status status-${status}`}>{STATUS_LABEL[status]}</span>
      </header>

      <main className="transcript">
        {segments.length === 0 && !partial && (
          <p className="empty">
            {recording ? "Parlez, la transcription s'affiche ici." : "Appuyez sur le micro pour démarrer la visite."}
          </p>
        )}
        {segments.map((segment) => (
          <p key={segment.id} className="segment">
            <time>{timeFormat.format(segment.at)}</time>
            {segment.text}
          </p>
        ))}
        {partial && <p className="segment partial">{partial}</p>}
        <div ref={endRef} />
      </main>

      <footer className="controls">
        {error && <p className="error">{error}</p>}
        <div className="buttons">
          <button className="secondary" onClick={clear} disabled={segments.length === 0}>
            Effacer
          </button>
          <button
            className={`mic ${recording ? "mic-on" : ""}`}
            onClick={recording ? stop : start}
            disabled={status === "connecting"}
            aria-label={recording ? "Arrêter l'enregistrement" : "Démarrer l'enregistrement"}
            style={{ "--level": Math.min(1, level * 6) } as CSSProperties}
          >
            {recording ? "■" : "●"}
          </button>
          <span className="spacer" />
        </div>
      </footer>
    </div>
  );
}
