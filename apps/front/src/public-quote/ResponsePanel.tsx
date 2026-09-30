import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { QuoteDocument } from "../api/types";

type Mode = "choice" | "accept" | "decline";

/**
 * Réponse du client : accepter (le nom saisi vaut signature) ou refuser.
 * `onNameChange` permet de dessiner la signature dans le document pendant la saisie.
 */
export function ResponsePanel(props: {
  token: string;
  doc: QuoteDocument;
  onAnswered: (doc: QuoteDocument) => void;
  onNameChange: (name: string) => void;
}) {
  const { token, doc, onAnswered, onNameChange } = props;
  const [mode, setMode] = useState<Mode>("choice");
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent, action: () => Promise<QuoteDocument>) => {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      onAnswered(await action());
    } catch (err) {
      setError(err instanceof Error ? err.message : "La réponse n'a pas pu être envoyée. Réessayez.");
    } finally {
      setSending(false);
    }
  };

  const changeMode = (next: Mode) => {
    setMode(next);
    setError(null);
    if (next !== "accept") onNameChange("");
  };

  return (
    <section id="reponse" className="pq-panel" aria-labelledby="pq-panel-title">
      <h2 id="pq-panel-title">Votre réponse</h2>

      {mode === "choice" && (
        <>
          <p>
            Ce devis vous convient ? Acceptez-le en ligne : votre nom vaut signature et {doc.company.name} est informé
            immédiatement.
          </p>
          <div className="pq-panel-actions">
            <button className="pq-button pq-button-primary" onClick={() => changeMode("accept")}>
              Accepter le devis
            </button>
            <button className="pq-button pq-button-quiet" onClick={() => changeMode("decline")}>
              Refuser le devis
            </button>
          </div>
        </>
      )}

      {mode === "accept" && (
        <form onSubmit={(e) => void submit(e, () => api.acceptQuote(token, name.trim(), message.trim()))}>
          <label className="pq-field">
            Votre nom et prénom
            <input
              autoFocus
              autoComplete="name"
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                onNameChange(e.target.value);
              }}
            />
          </label>
          <label className="pq-check">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            J'ai lu ce devis, reçu avant l'exécution des travaux, et je l'accepte.
          </label>
          <label className="pq-field">
            Un mot pour l'entreprise (facultatif)
            <textarea rows={2} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
          {error && <p className="pq-error">{error}</p>}
          <div className="pq-panel-actions">
            <button
              type="submit"
              className="pq-button pq-button-primary"
              disabled={sending || !agreed || name.trim().length < 2}
            >
              {sending ? "Envoi…" : "Signer et accepter"}
            </button>
            <button type="button" className="pq-button pq-button-quiet" onClick={() => changeMode("choice")}>
              Annuler
            </button>
          </div>
        </form>
      )}

      {mode === "decline" && (
        <form onSubmit={(e) => void submit(e, () => api.declineQuote(token, message.trim()))}>
          <label className="pq-field">
            Pourquoi refusez-vous ce devis ? (facultatif)
            <textarea
              autoFocus
              rows={3}
              maxLength={1000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          {error && <p className="pq-error">{error}</p>}
          <div className="pq-panel-actions">
            <button type="submit" className="pq-button pq-button-danger" disabled={sending}>
              {sending ? "Envoi…" : "Confirmer le refus"}
            </button>
            <button type="button" className="pq-button pq-button-quiet" onClick={() => changeMode("choice")}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
