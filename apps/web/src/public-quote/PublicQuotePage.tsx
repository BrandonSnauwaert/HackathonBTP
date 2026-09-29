import { useEffect, useState } from "react";
import { ApiError, api } from "../api/client";
import type { QuoteDocument } from "../api/types";
import { formatCents, formatDate } from "../format";
import { QuoteSheet } from "./QuoteSheet";
import { ResponsePanel } from "./ResponsePanel";
import "./public-quote.css";

/** Ce que la page affiche : le devis reçu par le client (lien secret) ou l'aperçu de l'artisan. */
export type PublicQuoteSource = { kind: "public"; token: string } | { kind: "preview"; quoteId: string };

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; doc: QuoteDocument };

export default function PublicQuotePage({ source }: { source: PublicQuoteSource }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [signatureName, setSignatureName] = useState("");

  // Valeurs simples en dépendances : un nouvel objet `source` identique ne recharge pas le devis.
  const token = source.kind === "public" ? source.token : null;
  const quoteId = source.kind === "preview" ? source.quoteId : null;
  useEffect(() => {
    const load = token !== null ? api.openPublicQuote(token) : api.previewDocument(quoteId ?? "");
    load.then(
      (doc) => setState({ status: "ready", doc }),
      (err: unknown) =>
        setState({
          status: "error",
          message:
            err instanceof ApiError && (err.status === 404 || err.status === 400)
              ? "Ce lien ne correspond à aucun devis. Vérifiez le lien reçu par e-mail ou contactez l'entreprise."
              : "Le devis n'a pas pu être chargé. Vérifiez votre connexion puis rechargez la page.",
        }),
    );
  }, [token, quoteId]);

  // Sur téléphone, la barre « Répondre » s'efface quand le formulaire de réponse est à l'écran.
  const [panelVisible, setPanelVisible] = useState(false);
  const ready = state.status === "ready";
  useEffect(() => {
    const panel = ready ? document.getElementById("reponse") : null;
    if (!panel) return;
    const observer = new IntersectionObserver(([entry]) => setPanelVisible(entry?.isIntersecting ?? false));
    observer.observe(panel);
    return () => observer.disconnect();
  }, [ready]);

  const loadedDoc = state.status === "ready" ? state.doc : null;
  useEffect(() => {
    if (loadedDoc) document.title = `Devis ${loadedDoc.number} · ${loadedDoc.company.name}`;
  }, [loadedDoc]);

  if (state.status !== "ready") {
    return (
      <main className="pq-page pq-page-message">
        <p>{state.status === "loading" ? "Chargement du devis…" : state.message}</p>
      </main>
    );
  }

  const { doc } = state;

  return (
    <main className={`pq-page ${doc.canRespond ? "pq-has-bar" : ""}`}>
      <StatusBanner doc={doc} />

      <div className="pq-toolbar">
        <button className="pq-button pq-button-quiet" onClick={() => window.print()}>
          Imprimer ou enregistrer en PDF
        </button>
      </div>

      <QuoteSheet doc={doc} signatureName={signatureName} />

      {doc.canRespond && source.kind === "public" && (
        <ResponsePanel
          token={source.token}
          doc={doc}
          onNameChange={setSignatureName}
          onAnswered={(answered) => {
            setSignatureName("");
            setState({ status: "ready", doc: answered });
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      {doc.canRespond && (
        <div className={`pq-bar ${panelVisible ? "pq-bar-hidden" : ""}`} role="region" aria-label="Répondre au devis">
          <span>
            Total TTC <strong>{formatCents(doc.totals.totalTtcCents)}</strong>
          </span>
          <a className="pq-button pq-button-primary" href="#reponse">
            Répondre
          </a>
        </div>
      )}
    </main>
  );
}

function StatusBanner({ doc }: { doc: QuoteDocument }) {
  if (doc.preview) {
    return (
      <p className="pq-banner pq-banner-preview">
        Aperçu : voici ce que verra votre client. Cette page n'enregistre rien.
      </p>
    );
  }
  if (doc.response?.decision === "accepted") {
    return (
      <p className="pq-banner pq-banner-accepted">
        Devis accepté le {formatDate(doc.response.at)} par {doc.response.name}. {doc.company.name} a reçu votre accord.
      </p>
    );
  }
  if (doc.status === "declined") {
    return (
      <p className="pq-banner pq-banner-declined">
        Devis refusé{doc.response ? ` le ${formatDate(doc.response.at)}` : ""}. {doc.company.name} a été informé.
      </p>
    );
  }
  if (doc.status === "expired") {
    return (
      <p className="pq-banner pq-banner-declined">
        Ce devis a expiré le {formatDate(doc.validUntil)}. Contactez {doc.company.name} pour en obtenir un nouveau.
      </p>
    );
  }
  return null;
}
