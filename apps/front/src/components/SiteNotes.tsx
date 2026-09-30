import { useState } from "react";
import { api } from "../api/client";
import type { QuoteDetail } from "../api/types";
import { formatDayTime } from "../format";

/**
 * Notes de chantier (internes, jamais montrées au client) : la note libre de l'artisan
 * et le texte de chaque dictée, avec l'audio d'origine. Toujours consultables ;
 * la note ne se modifie que tant que le devis n'est pas envoyé (brouillon ou prêt).
 */
export function SiteNotes(props: { quote: QuoteDetail; editable: boolean; onSave: (notes: string) => void }) {
  const { quote, editable, onSave } = props;
  const [notes, setNotes] = useState(quote.notes);
  const [listening, setListening] = useState<string | null>(null);
  const dictations = quote.clips.filter((clip) => clip.transcript);

  if (!editable && !quote.notes && dictations.length === 0) return null;

  return (
    <section className="card site-notes">
      <div className="row">
        <h2 className="b">Notes de chantier</h2>
        <span className="small mut">visibles par vous seul</span>
      </div>

      {editable ? (
        <label className="field">
          <textarea
            aria-label="Note libre"
            rows={3}
            value={notes}
            placeholder="Accès, code du portail, matériaux à prévoir…"
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes.trim() !== quote.notes && onSave(notes.trim())}
          />
        </label>
      ) : (
        quote.notes && <p className="notes-text">{quote.notes}</p>
      )}

      {dictations.length > 0 && (
        <div className="dictations">
          <span className="small mut b">Dictées ({dictations.length})</span>
          {dictations.map((clip) => (
            <div key={clip.id} className="dictation">
              <div className="row">
                <span className="small b blue-text">{formatDayTime(clip.recordedAt)}</span>
                <button
                  type="button"
                  className="link"
                  onClick={() => setListening((id) => (id === clip.id ? null : clip.id))}
                >
                  {listening === clip.id ? "Fermer" : "Écouter"}
                </button>
              </div>
              <p className="small">{clip.transcript}</p>
              {listening === clip.id && <audio controls autoPlay src={api.clipAudioUrl(quote.id, clip.id)} />}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
