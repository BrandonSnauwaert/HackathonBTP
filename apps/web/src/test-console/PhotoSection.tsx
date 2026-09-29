import { useState } from "react";
import { api } from "../api/client";
import type { Photo } from "../api/types";
import { resizeImage } from "../images/resizeImage";

interface Upload {
  id: string;
  name: string;
  error: string | null;
}

const message = (err: unknown) => (err instanceof Error ? err.message : "Erreur inattendue");

/** Photos de chantier d'un devis : ajout (réduites sur l'appareil), légende, visibilité client, suppression. */
export function PhotoSection(props: { quoteId: string; photos: Photo[]; editable: boolean; onChanged: () => void }) {
  const { quoteId, photos, editable, onChanged } = props;
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState<string | null>(null);

  const addFiles = async (files: FileList) => {
    for (const file of Array.from(files)) {
      const upload: Upload = { id: crypto.randomUUID(), name: file.name, error: null };
      setUploads((list) => [...list, upload]);
      try {
        const takenAt = file.lastModified ? new Date(file.lastModified) : new Date();
        await api.uploadPhoto(quoteId, await resizeImage(file), upload.id, takenAt);
        setUploads((list) => list.filter((u) => u.id !== upload.id));
        onChanged();
      } catch (err) {
        setUploads((list) => list.map((u) => (u.id === upload.id ? { ...u, error: message(err) } : u)));
      }
    }
  };

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(message(err));
    }
  };

  return (
    <>
      <h3>Photos</h3>
      {photos.length === 0 && uploads.length === 0 && <p className="muted">Aucune photo pour ce devis.</p>}
      {error && <p className="error-text">{error}</p>}
      <ul className="photos">
        {photos.map((photo) => (
          <li key={photo.id} className="photo">
            <a href={photo.url} target="_blank" rel="noreferrer">
              <img src={photo.url} alt={photo.caption || "Photo de chantier"} loading="lazy" />
            </a>
            <input
              key={`${photo.id}:${photo.caption}`}
              defaultValue={photo.caption}
              placeholder="Légende"
              disabled={!editable}
              onBlur={(e) => {
                const caption = e.target.value.trim();
                if (caption !== photo.caption) void run(() => api.updatePhoto(quoteId, photo.id, { caption }));
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
            <div className="photo-actions">
              <label>
                <input
                  type="checkbox"
                  checked={photo.visibleToClient}
                  disabled={!editable}
                  onChange={(e) =>
                    void run(() => api.updatePhoto(quoteId, photo.id, { visibleToClient: e.target.checked }))
                  }
                />{" "}
                Visible par le client
              </label>
              {editable && (
                <button
                  className="link danger"
                  onClick={() => void run(() => api.deletePhoto(quoteId, photo.id))}
                  aria-label="Supprimer la photo"
                >
                  Supprimer
                </button>
              )}
            </div>
          </li>
        ))}
        {uploads.map((upload) => (
          <li key={upload.id} className="photo photo-pending">
            <span className="muted">{upload.name}</span>
            {upload.error ? <span className="error-text">{upload.error}</span> : <span className="muted">Envoi…</span>}
          </li>
        ))}
      </ul>
      {editable && (
        <label className="file-upload">
          Ajouter des photos (appareil photo ou galerie)
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </>
  );
}
