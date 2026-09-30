import { useState } from "react";

/**
 * Avant une écoute passive : ce qu'elle implique (traitement bien plus long) et l'accord du client,
 * obligatoire puisque la conversation est enregistrée.
 */
export function PassiveSheet(props: { onStart: () => Promise<boolean>; onClose: () => void; error: string | null }) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    const started = await props.onStart();
    setBusy(false);
    if (started) props.onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <div className="sheet" role="dialog" aria-label="Écoute passive" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 className="h2">Écoute passive</h2>
          <button type="button" className="btn ghost" onClick={props.onClose}>
            Annuler
          </button>
        </div>
        <p className="small">
          Le téléphone enregistre la visite ; les lignes du devis sont extraites de la conversation.
        </p>
        <div className="card w">
          <span className="b">Beaucoup plus long à traiter que des dictées</span>
          <span className="small">
            Comptez à peu près la durée enregistrée (20 min de visite ≈ 25 min d'attente), contre quelques secondes par
            dictée.
          </span>
        </div>
        <label className="consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            Le client est informé que la conversation est enregistrée pour préparer le devis, et il l'accepte.
          </span>
        </label>
        {props.error && <p className="error-text">{props.error}</p>}
        <button
          type="button"
          className={`btn ${consent && !busy ? "pri" : "dis"}`}
          disabled={!consent || busy}
          onClick={() => void start()}
        >
          {busy ? "Ouverture du micro…" : "Démarrer l'écoute"}
        </button>
      </div>
    </div>
  );
}
