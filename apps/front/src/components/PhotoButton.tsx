import { useState } from "react";
import { api } from "../api/client";
import { resizeImage } from "../images/resizeImage";
import { errorMessage } from "../quotes/useQuote";

/** Prise de photo de chantier (appareil photo du téléphone ou galerie), réduite avant l'envoi. */
export function PhotoButton(props: { quoteId: string; onAdded: () => void; className?: string }) {
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const addFiles = async (files: FileList) => {
    setError(null);
    for (const file of Array.from(files)) {
      setPending((n) => n + 1);
      try {
        const takenAt = file.lastModified ? new Date(file.lastModified) : new Date();
        await api.uploadPhoto(props.quoteId, await resizeImage(file), crypto.randomUUID(), takenAt);
        props.onAdded();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setPending((n) => n - 1);
      }
    }
  };

  return (
    <label className={`btn ${props.className ?? ""}`} title={error ?? undefined}>
      <span aria-hidden="true">◉</span> {pending > 0 ? "Envoi…" : error ? "Photo : échec" : "Photo"}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}
