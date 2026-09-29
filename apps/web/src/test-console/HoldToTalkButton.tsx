import type { CSSProperties } from "react";
import { useClipRecorder, type RecordedClip } from "../audio/useClipRecorder";

const HINTS = {
  idle: "Maintenir pour dicter",
  starting: "Ouverture du micro…",
  ready: "Maintenir pour dicter",
  recording: "Relâcher pour envoyer",
  error: "Maintenir pour réessayer",
};

/** Bouton talkie-walkie : enregistre tant qu'il est maintenu (souris, doigt ou barre d'espace). */
export function HoldToTalkButton({ onClip, disabled }: { onClip: (clip: RecordedClip) => void; disabled: boolean }) {
  const { state, level, error, start, stop } = useClipRecorder();
  const recording = state === "recording";

  const release = async () => {
    const clip = await stop();
    if (clip) onClip(clip);
  };

  return (
    <div className="talk">
      <button
        type="button"
        className={`talk-button ${recording ? "talk-on" : ""}`}
        disabled={disabled}
        style={{ "--level": Math.min(1, level * 6) } as CSSProperties}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          void start();
        }}
        onPointerUp={() => void release()}
        onPointerCancel={() => void release()}
        onKeyDown={(e) => {
          if (e.key === " " && !e.repeat) {
            e.preventDefault();
            void start();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " ") void release();
        }}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Maintenir pour dicter"
      >
        {recording ? "●" : "🎙"}
      </button>
      <span className="talk-hint">{disabled ? "Devis non modifiable" : HINTS[state]}</span>
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
