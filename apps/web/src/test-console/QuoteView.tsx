import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../api/client";
import type { Clip, QuoteDetail, QuoteLine, QuoteStatus } from "../api/types";
import type { RecordedClip } from "../audio/useClipRecorder";
import {
  centsToInput,
  formatCents,
  formatDuration,
  formatQuantity,
  formatTime,
  formatVat,
  parseEuros,
} from "../format";
import { HoldToTalkButton } from "./HoldToTalkButton";

const TRANSITION_LABELS: Partial<Record<QuoteStatus, string>> = {
  draft: "Repasser en brouillon",
  ready: "Marquer prêt à envoyer",
  accepted: "Marquer accepté",
  declined: "Marquer refusé",
};
const VAT_RATES = [2000, 1000, 550, 0];
const POLL_MS = 1000;

/** Dictée en cours d'envoi, gardée en mémoire pour pouvoir la renvoyer en cas d'échec. */
interface Upload {
  clientClipId: string;
  clip: RecordedClip;
  error: string | null;
}

const isProcessing = (clip: Clip) => clip.status !== "done" && clip.status !== "failed";
const message = (err: unknown) => (err instanceof Error ? err.message : "Erreur inattendue");

export function QuoteView({ quoteId, onChanged }: { quoteId: string; onChanged: () => void }) {
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);

  const load = useCallback(async () => {
    try {
      setQuote(await api.getQuote(quoteId));
    } catch (err) {
      setError(message(err));
    }
  }, [quoteId]);

  /** Applique une réponse de l'API (devis complet) ou affiche l'erreur. */
  const run = async (action: () => Promise<QuoteDetail>) => {
    setError(null);
    try {
      setQuote(await action());
      onChanged();
    } catch (err) {
      const issues = err instanceof ApiError && err.code === "quote_incomplete" ? " (voir les points à compléter)" : "";
      setError(message(err) + issues);
      await load();
    }
  };

  // Le parent remonte ce composant (key) à chaque changement de devis : l'état repart de zéro.
  useEffect(() => {
    // Chargement de données depuis l'API : c'est bien une synchronisation avec un système externe.
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);

  // Rafraîchit tant qu'une dictée est en cours de traitement.
  const processing = quote?.clips.some(isProcessing) ?? false;
  useEffect(() => {
    if (!processing) {
      onChanged();
      return;
    }
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [processing, load, onChanged]);

  const send = async (upload: Upload) => {
    setUploads((list) => [...list.filter((u) => u.clientClipId !== upload.clientClipId), { ...upload, error: null }]);
    try {
      await api.uploadClip(quoteId, upload.clip.wav, upload.clientClipId, upload.clip.recordedAt);
      setUploads((list) => list.filter((u) => u.clientClipId !== upload.clientClipId));
      await load();
    } catch (err) {
      setUploads((list) =>
        list.map((u) => (u.clientClipId === upload.clientClipId ? { ...u, error: message(err) } : u)),
      );
    }
  };

  const onClip = (clip: RecordedClip) => void send({ clientClipId: crypto.randomUUID(), clip, error: null });

  const onFile = async (file: File) => {
    await send({
      clientClipId: crypto.randomUUID(),
      clip: { wav: file, durationMs: 0, recordedAt: new Date() },
      error: null,
    });
  };

  if (!quote) return <section className="panel quote">{error ?? "Chargement…"}</section>;
  const editable = quote.status === "draft" || quote.status === "ready";

  return (
    <section className="panel quote">
      <header className="quote-header">
        <div>
          <h2>
            {quote.number} · {quote.title || "Sans titre"}
          </h2>
          <p className="muted">
            {quote.client.name}
            {quote.client.email && ` · ${quote.client.email}`}
          </p>
        </div>
        <span className={`badge badge-${quote.status}`}>{quote.statusLabel}</span>
      </header>

      <div className="actions">
        {quote.allowedTransitions.map((status) => (
          <button key={status} className="secondary" onClick={() => void run(() => api.changeStatus(quote.id, status))}>
            {TRANSITION_LABELS[status] ?? status}
          </button>
        ))}
      </div>
      {error && <p className="error-text">{error}</p>}
      {quote.issues.length > 0 && (
        <ul className="issues">
          {quote.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}

      <h3>Lignes</h3>
      {quote.lines.length === 0 ? (
        <p className="muted">Aucune ligne. Dictez les travaux avec le bouton ci-dessous.</p>
      ) : (
        <div className="table-wrap">
          <table className="lines">
            <thead>
              <tr>
                <th>Désignation</th>
                <th>Qté</th>
                <th>PU HT (€)</th>
                <th>TVA</th>
                <th>Total HT</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((line) => (
                <LineRow
                  // Remonté quand le prix change côté serveur : le champ reprend la valeur enregistrée.
                  key={`${line.id}:${line.unitPriceCents}`}
                  line={line}
                  editable={editable}
                  onPrice={(cents) => void run(() => api.updateLine(quote.id, line.id, { unitPriceCents: cents }))}
                  onVat={(bp) => void run(() => api.updateLine(quote.id, line.id, { vatRateBp: bp }))}
                  onDelete={() => void run(() => api.deleteLine(quote.id, line.id))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <dl className="totals">
        <dt>Total HT</dt>
        <dd>{formatCents(quote.totals.totalHtCents)}</dd>
        {quote.totals.vatBreakdown.map((vat) => (
          <div key={vat.vatRateBp} className="totals-row">
            <dt>TVA {formatVat(vat.vatRateBp)}</dt>
            <dd>{formatCents(vat.vatCents)}</dd>
          </div>
        ))}
        <dt className="strong">Total TTC</dt>
        <dd className="strong">{formatCents(quote.totals.totalTtcCents)}</dd>
      </dl>
      {quote.totals.unpricedLineCount > 0 && (
        <p className="muted">{quote.totals.unpricedLineCount} ligne(s) sans prix : totaux partiels.</p>
      )}
      {quote.totals.vatMention && <p className="muted">{quote.totals.vatMention}</p>}

      <h3>Dictées</h3>
      {quote.clips.length === 0 && uploads.length === 0 && <p className="muted">Aucune dictée pour ce devis.</p>}
      <ol className="clips">
        {quote.clips.map((clip) => (
          <ClipItem
            key={clip.id}
            quoteId={quote.id}
            clip={clip}
            onRetry={() => void api.retryClip(quote.id, clip.id).then(load, (err: unknown) => setError(message(err)))}
          />
        ))}
        {uploads.map((upload) => (
          <li key={upload.clientClipId} className="clip">
            <div className="clip-head">
              <span className={`badge ${upload.error ? "badge-failed" : "badge-pending"}`}>
                {upload.error ? "Envoi échoué" : "Envoi…"}
              </span>
              {upload.clip.durationMs > 0 && <span className="muted">{formatDuration(upload.clip.durationMs)}</span>}
            </div>
            {upload.error && (
              <p className="error-text">
                {upload.error}{" "}
                <button className="link" onClick={() => void send(upload)}>
                  Renvoyer
                </button>
              </p>
            )}
          </li>
        ))}
      </ol>

      <footer className="talk-bar">
        <HoldToTalkButton onClip={onClip} disabled={!editable} />
        <label className="file-upload">
          ou envoyer un fichier WAV
          <input
            type="file"
            accept="audio/wav,.wav"
            disabled={!editable}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
              e.target.value = "";
            }}
          />
        </label>
      </footer>
    </section>
  );
}

function LineRow(props: {
  line: QuoteLine;
  editable: boolean;
  onPrice: (cents: number | null) => void;
  onVat: (bp: number) => void;
  onDelete: () => void;
}) {
  const { line, editable } = props;
  const [price, setPrice] = useState(centsToInput(line.unitPriceCents));

  const commitPrice = () => {
    const cents = parseEuros(price);
    if (cents === undefined) return setPrice(centsToInput(line.unitPriceCents));
    if (cents !== line.unitPriceCents) props.onPrice(cents);
  };

  return (
    <tr className={line.source === "dictation" ? "from-dictation" : ""}>
      <td>
        {line.room && <span className="room">{line.room}</span>}
        {line.description}
      </td>
      <td className="num">
        {formatQuantity(line.quantity)} {line.unitLabel}
      </td>
      <td>
        <input
          className="price"
          inputMode="decimal"
          value={price}
          placeholder="à chiffrer"
          disabled={!editable}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={commitPrice}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </td>
      <td>
        <select value={line.vatRateBp} disabled={!editable} onChange={(e) => props.onVat(Number(e.target.value))}>
          {VAT_RATES.map((bp) => (
            <option key={bp} value={bp}>
              {formatVat(bp)}
            </option>
          ))}
        </select>
      </td>
      <td className="num">{line.totalHtCents === null ? "—" : formatCents(line.totalHtCents)}</td>
      <td>
        {editable && (
          <button className="link danger" onClick={props.onDelete} aria-label="Supprimer la ligne">
            ✕
          </button>
        )}
      </td>
    </tr>
  );
}

function ClipItem({ quoteId, clip, onRetry }: { quoteId: string; clip: Clip; onRetry: () => void }) {
  return (
    <li className="clip">
      <div className="clip-head">
        <span className={`badge badge-${clip.status === "done" || clip.status === "failed" ? clip.status : "pending"}`}>
          {clip.statusLabel}
        </span>
        <span className="muted">
          {formatTime(clip.recordedAt)} · {formatDuration(clip.durationMs)}
          {clip.status === "done" && ` · ${clip.lineCount} ligne(s) ajoutée(s)`}
        </span>
      </div>
      {clip.transcript && <blockquote>{clip.transcript}</blockquote>}
      {clip.warnings.length > 0 && (
        <ul className="warnings">
          {clip.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {clip.error && (
        <p className="error-text">
          {clip.error}{" "}
          <button className="link" onClick={onRetry}>
            Relancer
          </button>
        </p>
      )}
      <audio controls preload="none" src={api.clipAudioUrl(quoteId, clip.id)} />
    </li>
  );
}
