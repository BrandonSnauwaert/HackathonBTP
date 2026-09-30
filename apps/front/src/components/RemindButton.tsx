import { useState, type MouseEvent } from "react";
import { api } from "../api/client";
import type { QuoteDetail } from "../api/types";
import { errorMessage } from "../quotes/useQuote";

/**
 * Relance en un clic : e-mail de rappel au client (même lien que l'envoi). Placé dans une ligne
 * ou une carte cliquable : le clic ne l'ouvre pas.
 */
export function RemindButton(props: { quoteId: string; onDone: (quote: QuoteDetail) => void; className?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const remind = async (e: MouseEvent) => {
    e.stopPropagation();
    setState("busy");
    setError(null);
    try {
      const quote = await api.remind(props.quoteId);
      setState("done");
      props.onDone(quote);
    } catch (err) {
      setError(errorMessage(err));
      setState("idle");
    }
  };

  return (
    <span className="remind">
      <button
        type="button"
        className={`btn remind-btn ${props.className ?? ""}`}
        disabled={state !== "idle"}
        onClick={(e) => void remind(e)}
        title="Envoyer un e-mail de rappel au client"
      >
        {state === "busy" ? "Envoi…" : state === "done" ? "Relancé ✓" : "↻ Relancer"}
      </button>
      {error && (
        <span className="small error-text" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
