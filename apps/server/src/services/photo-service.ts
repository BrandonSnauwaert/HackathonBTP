import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Database } from "../db/database.js";
import { HttpError } from "../http/errors.js";
import { IMAGE_EXTENSIONS, detectImageType } from "../images/image-type.js";
import {
  deletePhoto,
  findPhotoByClientId,
  getPhoto,
  insertPhoto,
  listPhotos,
  toPhotoView,
  updatePhoto,
  type PhotoView,
} from "../repositories/photos.js";
import { getQuote } from "../repositories/quotes.js";
import type { PatchOf } from "../types.js";
import type { QuoteService } from "./quote-service.js";

export interface PhotoServiceDeps {
  db: Database;
  quotes: QuoteService;
  photosDir: string;
  maxPhotoBytes: number;
}

export interface PhotoUploadMeta {
  /** Identifiant généré par le téléphone, pour ne pas dupliquer une photo renvoyée. */
  clientPhotoId?: string | undefined;
  /** Moment de la prise de vue (la photo a pu être prise hors connexion). */
  takenAt?: string | undefined;
  caption?: string | undefined;
}

/**
 * Photos de chantier d'un devis. Comme les dictées, on ne peut en ajouter, modifier ou
 * supprimer que tant que le devis est modifiable (brouillon ou prêt).
 */
export function createPhotoService({ db, quotes, photosDir, maxPhotoBytes }: PhotoServiceDeps) {
  return {
    async upload(
      userId: string,
      quoteId: string,
      image: Buffer,
      meta: PhotoUploadMeta,
    ): Promise<{ photo: PhotoView; created: boolean }> {
      quotes.assertEditable(userId, quoteId);
      if (meta.clientPhotoId) {
        const existing = findPhotoByClientId(db, quoteId, meta.clientPhotoId);
        if (existing) return { photo: toPhotoView(existing), created: false };
      }

      const mimeType = detectImageType(image);
      if (!mimeType) throw new HttpError(400, "invalid_image", "Image attendue : JPEG, PNG ou WebP");
      if (image.length > maxPhotoBytes) {
        const maxMb = Math.round(maxPhotoBytes / 1024 / 1024);
        throw new HttpError(400, "photo_too_large", `Photo trop lourde (${maxMb} Mo maximum)`);
      }

      const id = randomUUID();
      const file = `${id}.${IMAGE_EXTENSIONS[mimeType]}`;
      await mkdir(photosDir, { recursive: true });
      await writeFile(join(photosDir, file), image);
      try {
        insertPhoto(db, {
          id,
          quoteId,
          clientPhotoId: meta.clientPhotoId ?? null,
          file,
          mimeType,
          sizeBytes: image.length,
          caption: meta.caption ?? "",
          takenAt: meta.takenAt ?? new Date().toISOString(),
        });
      } catch (err) {
        await rm(join(photosDir, file), { force: true });
        // Deux envois simultanés de la même photo : le second récupère le premier.
        const existing = meta.clientPhotoId ? findPhotoByClientId(db, quoteId, meta.clientPhotoId) : undefined;
        if (existing) return { photo: toPhotoView(existing), created: false };
        throw err;
      }
      return { photo: toPhotoView(getPhoto(db, quoteId, id)), created: true };
    },

    list(userId: string, quoteId: string): PhotoView[] {
      getQuote(db, userId, quoteId);
      return listPhotos(db, quoteId).map(toPhotoView);
    },

    /** Chemin et type du fichier, pour l'envoyer au navigateur. */
    file(userId: string, quoteId: string, photoId: string): { path: string; mimeType: string } {
      getQuote(db, userId, quoteId);
      const photo = getPhoto(db, quoteId, photoId);
      return { path: join(photosDir, photo.file), mimeType: photo.mimeType };
    },

    update(
      userId: string,
      quoteId: string,
      photoId: string,
      update: PatchOf<{ caption: string; visibleToClient: boolean }>,
    ): PhotoView {
      quotes.assertEditable(userId, quoteId);
      getPhoto(db, quoteId, photoId);
      updatePhoto(db, photoId, update);
      return toPhotoView(getPhoto(db, quoteId, photoId));
    },

    async remove(userId: string, quoteId: string, photoId: string): Promise<void> {
      quotes.assertEditable(userId, quoteId);
      const photo = getPhoto(db, quoteId, photoId);
      deletePhoto(db, photoId);
      await rm(join(photosDir, photo.file), { force: true });
    },
  };
}

export type PhotoService = ReturnType<typeof createPhotoService>;
