import { useEffect, useState } from "react";
import { useClipRecorder } from "../audio/useClipRecorder";
import { useWakeLock } from "../audio/useWakeLock";
import { Badge } from "../components/Badge";
import { ClipCards } from "../components/ClipCards";
import { LevelBars } from "../components/LevelBars";
import { PassiveListening } from "../components/PassiveListening";
import { PhotoButton } from "../components/PhotoButton";
import { TalkButton } from "../components/TalkButton";
import { formatClock, formatQuantity, formatTime } from "../format";
import { formatRemaining, lastReadyAt, pendingPassiveMinutes } from "../quotes/eta";
import { clipWarnings, isEditable } from "../quotes/status";
import { useQuote } from "../quotes/useQuote";
import { navigate } from "../router";

/** Durée de l'enregistrement en cours, rafraîchie chaque seconde. */
function useRecordingClock(recording: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!recording) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 250);
    return () => {
      clearInterval(timer);
      setElapsed(0);
    };
  }, [recording]);
  return elapsed;
}

/**
 * E2 — Visite : l'artisan dicte en talkie-walkie (maintenir, parler, relâcher), ou lance une écoute
 * passive de toute la visite ; les lignes comprises s'affichent au fil des dictées, avec le temps restant.
 */
export function VisitScreen({ quoteId }: { quoteId: string }) {
  const { quote, error, uploads, online, processing, load, send, addClip, retryClip } = useQuote(quoteId);
  const recorder = useClipRecorder();
  const recording = recorder.state === "recording";
  const elapsed = useRecordingClock(recording);
  const [mode, setMode] = useState<"dictation" | "passive">("dictation");
  // Pendant toute la visite : l'artisan pose souvent le téléphone entre deux dictées.
  useWakeLock(true);

  if (!quote) return <p className="loading">{error ?? "Chargement…"}</p>;

  const editable = isEditable(quote.status);
  const warnings = clipWarnings(quote);
  const dictatedMs = quote.clips.reduce((sum, clip) => sum + clip.durationMs, 0);
  const transcripts = quote.clips.filter((clip) => clip.transcript);
  const lastTranscript = transcripts.at(-1);
  const waiting = uploads.filter((u) => u.waiting).length;
  const readyAt = lastReadyAt(quote.clips);
  const passiveMinutes = pendingPassiveMinutes(quote.clips);
  const pillLabel = recording
    ? mode === "passive"
      ? "J'écoute"
      : "J'enregistre"
    : waiting > 0
      ? `${waiting} en attente`
      : processing || uploads.length > 0
        ? "J'analyse…"
        : online
          ? "Prêt"
          : "Hors connexion";

  return (
    <div className="screen visit">
      <header className="hd blue">
        <button className="back" onClick={() => navigate({ name: "home" })}>
          ‹ Accueil
        </button>
        <div className="visit-head">
          <div>
            <h1 className="h2 big-name">{quote.client.name}</h1>
            <div className="on-blue-sub">{quote.siteAddress || quote.title || quote.number}</div>
          </div>
          <div className="row visit-live">
            <span className={`pill ${recording ? "" : "idle"}`}>
              <i />
              {pillLabel}
            </span>
            <LevelBars level={recorder.level} active={recording} />
            <span className="clock">{formatClock(recording ? elapsed : dictatedMs)}</span>
          </div>
        </div>
      </header>

      <div className="bd visit-body">
        <section className="understood">
          <div className="row">
            <h2 className="h2">Ce que j'ai compris</h2>
            <span className="mut">
              {quote.lines.length} poste{quote.lines.length > 1 ? "s" : ""}
            </span>
          </div>
          {readyAt && (
            <p className="small eta" role="status">
              Tout sera prêt dans <b>{formatRemaining(readyAt)}</b> (vers {formatTime(readyAt).slice(0, 5)})
              {passiveMinutes > 0 &&
                ` · ${passiveMinutes} min d'écoute passive à traiter : c'est plus long que des dictées`}
            </p>
          )}
          {error && <p className="error-text">{error}</p>}
          <div className="cards">
            {quote.lines.length === 0 && quote.clips.length === 0 && uploads.length === 0 && (
              <div className="card dash">Maintenez le bouton et décrivez les travaux, pièce par pièce.</div>
            )}
            {quote.lines.map((line) => (
              <div key={line.id} className="card">
                <div className="row top">
                  <span className="b">{line.description}</span>
                  <span className="b nowrap">
                    {formatQuantity(line.quantity)} {line.unitLabel}
                  </span>
                </div>
                <div className="row">
                  {line.source === "dictation" ? (
                    <Badge tone="ok">✓ détecté</Badge>
                  ) : (
                    <Badge tone="gy">saisi à la main</Badge>
                  )}
                  {line.room && <span className="mut small">{line.room}</span>}
                </div>
              </div>
            ))}
            {warnings.map((warning) => (
              <div key={warning} className="card w">
                <span className="b">{warning}</span>
                <Badge tone="w">! à vérifier</Badge>
              </div>
            ))}
            <ClipCards clips={quote.clips} uploads={uploads} onResend={(u) => void send(u)} onRetry={retryClip} />
          </div>
          {quote.photos.length > 0 && (
            <div className="thumbs">
              {quote.photos.map((photo) => (
                <img key={photo.id} className="thumb" src={photo.url} alt={photo.caption || "Photo de chantier"} />
              ))}
            </div>
          )}
        </section>

        <section className="card flat transcripts">
          <h2 className="b">Transcription</h2>
          {transcripts.length === 0 && <span className="mut small">Le texte de vos dictées s'affichera ici.</span>}
          {/* Sur téléphone, seule la dernière dictée ; sur ordinateur, toutes. */}
          {transcripts.map((clip) => (
            <p key={clip.id} className={`small ${clip === lastTranscript ? "" : "only-desktop"}`}>
              <span className="b blue-text">{formatTime(clip.recordedAt).slice(0, 5)}</span> · {clip.transcript}
            </p>
          ))}
        </section>
      </div>

      <footer className="ft">
        {recorder.error && <p className="error-text">{recorder.error}</p>}
        {editable && (
          <div className="seg" role="radiogroup" aria-label="Mode d'enregistrement">
            {(["dictation", "passive"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                className={mode === m ? "on" : ""}
                disabled={recording}
                onClick={() => setMode(m)}
              >
                {m === "dictation" ? "Dictées" : "Écoute passive"}
              </button>
            ))}
          </div>
        )}
        {mode === "passive" && editable ? (
          <PassiveListening
            recorder={recorder}
            onSegment={(clip) => addClip(clip, "passive")}
            extra={<PhotoButton quoteId={quote.id} onAdded={() => void load()} className="photo-btn" />}
          />
        ) : (
          <div className="btns">
            <PhotoButton quoteId={quote.id} onAdded={() => void load()} className="photo-btn" />
            <TalkButton recorder={recorder} onClip={addClip} disabled={!editable} className="grow2" />
          </div>
        )}
        <button className="btn pri" onClick={() => navigate({ name: "quote", id: quote.id })}>
          Terminer la visite
        </button>
      </footer>
    </div>
  );
}
