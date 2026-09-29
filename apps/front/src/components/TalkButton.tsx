import type { useClipRecorder, RecordedClip } from "../audio/useClipRecorder";

type Recorder = ReturnType<typeof useClipRecorder>;

const HINTS = {
  idle: "Maintenir pour parler",
  starting: "Ouverture du micro…",
  ready: "Maintenir pour parler",
  recording: "Relâcher pour envoyer",
  error: "Maintenir pour réessayer",
};

/**
 * Bouton talkie-walkie : enregistre tant qu'il est maintenu (doigt, souris ou barre d'espace).
 * L'enregistreur est fourni par l'écran, qui affiche aussi l'état du micro ailleurs (en-tête).
 */
export function TalkButton(props: {
  recorder: Recorder;
  onClip: (clip: RecordedClip) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const { recorder, onClip, disabled = false } = props;
  const recording = recorder.state === "recording";

  const release = async () => {
    const clip = await recorder.stop();
    if (clip) onClip(clip);
  };

  return (
    <button
      type="button"
      className={`btn talk ${recording ? "on" : ""} ${props.className ?? ""}`}
      disabled={disabled}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        void recorder.start();
      }}
      onPointerUp={() => void release()}
      onPointerCancel={() => void release()}
      onKeyDown={(e) => {
        if (e.key === " " && !e.repeat) {
          e.preventDefault();
          void recorder.start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " ") void release();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="talk-dot" aria-hidden="true" />
      {recording ? HINTS.recording : (props.label ?? HINTS[recorder.state])}
    </button>
  );
}
