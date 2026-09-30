import { useEffect, useRef, useState, type ReactNode } from "react";
import type { RecordedClip, useClipRecorder } from "../audio/useClipRecorder";
import { formatClock } from "../format";

type Recorder = ReturnType<typeof useClipRecorder>;

/** « 4 min 30 », « 5 min » */
const formatSegment = (ms: number) => {
  const seconds = Math.round(ms / 1000);
  const rest = seconds % 60;
  return `${Math.floor(seconds / 60)} min${rest ? ` ${String(rest).padStart(2, "0")}` : ""}`;
};

/** Un segment est envoyé toutes les 4 min 30 : sous la limite du serveur (5 min), une coupure ne perd qu'un segment. */
export const SEGMENT_MS = 270_000;

/**
 * Écoute passive : toute la visite est enregistrée, découpée en segments envoyés au fil de l'eau
 * (hors connexion, ils attendent sur le téléphone comme les dictées). Démarrage seulement après
 * l'accord du client : c'est un enregistrement de la conversation.
 */
export function PassiveListening(props: {
  recorder: Recorder;
  onSegment: (clip: RecordedClip) => void;
  disabled?: boolean;
  segmentMs?: number;
  /** Placé à côté du bouton principal (bouton Photo). */
  extra?: ReactNode;
}) {
  const { recorder, onSegment, disabled = false, segmentMs = SEGMENT_MS } = props;
  const [consent, setConsent] = useState(false);
  const [listening, setListening] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [segments, setSegments] = useState(0);
  const lastSplit = useRef(0);
  // Toujours la dernière version, pour le découpage périodique et la sortie de l'écran.
  const latest = useRef({ recorder, onSegment });
  useEffect(() => {
    latest.current = { recorder, onSegment };
  });

  const emit = (clip: RecordedClip | null) => {
    if (!clip) return;
    latest.current.onSegment(clip);
    setSegments((n) => n + 1);
  };

  useEffect(() => {
    if (!listening) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t - lastSplit.current >= segmentMs) {
        lastSplit.current = t;
        emit(latest.current.recorder.split());
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [listening, segmentMs]);

  // L'artisan quitte l'écran en cours d'écoute (« Terminer la visite ») : le dernier segment n'est pas perdu.
  useEffect(
    () => () => {
      const clip = latest.current.recorder.split();
      if (clip) latest.current.onSegment(clip);
    },
    [],
  );

  const start = async () => {
    if (!(await recorder.start())) return; // micro refusé : l'erreur s'affiche sous le bouton
    const t = Date.now();
    lastSplit.current = t;
    setStartedAt(t);
    setNow(t);
    setSegments(0);
    setListening(true);
  };

  const stop = async () => {
    setListening(false);
    emit(await recorder.stop());
  };

  if (listening) {
    return (
      <div className="card passive on">
        <div className="row">
          <span className="b">● Écoute en cours · {formatClock(now - startedAt)}</span>
          <span className="small mut">
            {segments} segment{segments > 1 ? "s" : ""} envoyé{segments > 1 ? "s" : ""}
          </span>
        </div>
        <span className="small mut">
          Posez le téléphone et parlez normalement. Un segment part toutes les {formatSegment(segmentMs)} ; l'analyse
          commence sans attendre la fin de la visite.
        </span>
        <div className="btns">
          {props.extra}
          <button className="btn pri grow2" onClick={() => void stop()}>
            Arrêter l'écoute
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card passive">
      <span className="small">
        L'écoute passive enregistre toute la visite. <b>Elle est beaucoup plus longue à traiter</b> que quelques dictées
        : il faut compter à peu près la durée enregistrée (20 min de visite ≈ 25 min d'attente), contre quelques
        secondes par dictée. Pour un devis rapide, préférez les dictées.
      </span>
      <label className="consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Le client est informé que la conversation est enregistrée pour préparer le devis, et il l'accepte.</span>
      </label>
      <div className="btns">
        {props.extra}
        <button
          className={`btn grow2 ${consent && !disabled ? "pri" : "dis"}`}
          disabled={!consent || disabled}
          onClick={() => void start()}
        >
          Démarrer l'écoute
        </button>
      </div>
    </div>
  );
}
