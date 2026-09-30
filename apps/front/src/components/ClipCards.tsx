import type { Clip } from "../api/types";
import type { Upload } from "../quotes/useQuote";
import { isProcessing } from "../quotes/useQuote";

/** Dictées pas encore transformées en lignes : en attente du réseau, envoi, traitement, échecs (avec relance). */
export function ClipCards(props: {
  clips: Clip[];
  uploads: Upload[];
  onResend: (upload: Upload) => void;
  onRetry: (clipId: string) => void;
}) {
  return (
    <>
      {props.uploads.map((upload) =>
        upload.error ? (
          <div key={upload.clientClipId} className="card w">
            <div className="row">
              <span className="b">Dictée non envoyée</span>
              <button className="btn ghost" onClick={() => props.onResend(upload)}>
                Renvoyer
              </button>
            </div>
            <span className="small">{upload.error}</span>
          </div>
        ) : upload.waiting ? (
          <div key={upload.clientClipId} className="card dash queued">
            <span className="b">Dictée enregistrée sur le téléphone</span>
            <span className="small">Envoi automatique au retour du réseau.</span>
          </div>
        ) : (
          <div key={upload.clientClipId} className="card dash pulse">
            Envoi de la dictée…
          </div>
        ),
      )}
      {props.clips.filter(isProcessing).map((clip) => (
        <div key={clip.id} className="card dash pulse">
          {clip.statusLabel}…
        </div>
      ))}
      {props.clips
        .filter((clip) => clip.status === "failed")
        .map((clip) => (
          <div key={clip.id} className="card w">
            <div className="row">
              <span className="b">Dictée non comprise</span>
              <button className="btn ghost" onClick={() => props.onRetry(clip.id)}>
                Relancer
              </button>
            </div>
            {clip.error && <span className="small">{clip.error}</span>}
          </div>
        ))}
    </>
  );
}
