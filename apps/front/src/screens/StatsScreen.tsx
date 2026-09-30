import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { QuoteSummary } from "../api/types";
import { PerformanceCharts, PerformanceTiles } from "../dashboard/Performance";
import { errorMessage, isNetworkError } from "../quotes/useQuote";
import { navigate } from "../router";

/**
 * Statistiques : taux de signature, chiffre signé, délais de réponse, entonnoir et chiffre par mois.
 * À part de l'accueil, qui reste l'outil du quotidien (actions à faire, liste des devis).
 */
export function StatsScreen() {
  const [quotes, setQuotes] = useState<QuoteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listQuotes()
      .then(setQuotes, (err: unknown) =>
        setError(
          isNetworkError(err) ? "Hors connexion : les statistiques ne sont pas disponibles." : errorMessage(err),
        ),
      );
  }, []);

  return (
    <div className="screen stats-screen">
      <header className="hd">
        <button className="back only-mobile" onClick={() => navigate({ name: "home" })}>
          ‹ Accueil
        </button>
        <h1 className="h1">Statistiques</h1>
        <div className="mut">De l'envoi à la signature : ce que vos devis rapportent.</div>
      </header>
      <div className="bd">
        {error && <p className="error-text">{error}</p>}
        {quotes === null && !error && <p className="mut">Chargement…</p>}
        {quotes !== null && <PerformanceTiles quotes={quotes} />}
        {quotes !== null && <PerformanceCharts quotes={quotes} />}
        {quotes !== null && quotes.every((q) => q.sentAt === null) && (
          <div className="card dash">Envoyez un premier devis : vos statistiques apparaîtront ici.</div>
        )}
      </div>
    </div>
  );
}
