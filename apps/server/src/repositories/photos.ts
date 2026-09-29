import { z } from "zod";
import { buildSet, execute, queryAll, queryOne, type Database } from "../db/database.js";
import { notFound } from "../http/errors.js";
import { IMAGE_TYPES, type ImageType } from "../images/image-type.js";
import type { PatchOf } from "../types.js";

export interface Photo {
  id: string;
  quoteId: string;
  clientPhotoId: string | null;
  file: string;
  mimeType: ImageType;
  sizeBytes: number;
  caption: string;
  /** Affichée au client sur la page du devis (sinon : note interne de l'artisan). */
  visibleToClient: boolean;
  takenAt: string;
  createdAt: string;
  updatedAt: string;
}

const PhotoRow = z
  .object({
    id: z.string(),
    quote_id: z.string(),
    client_photo_id: z.string().nullable(),
    file: z.string(),
    mime_type: z.enum(IMAGE_TYPES),
    size_bytes: z.number(),
    caption: z.string(),
    visible_to_client: z.number(),
    taken_at: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .transform((r): Photo => ({
    id: r.id,
    quoteId: r.quote_id,
    clientPhotoId: r.client_photo_id,
    file: r.file,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    caption: r.caption,
    visibleToClient: r.visible_to_client === 1,
    takenAt: r.taken_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

export function listPhotos(db: Database, quoteId: string): Photo[] {
  return queryAll(db, PhotoRow, "SELECT * FROM photos WHERE quote_id = :quoteId ORDER BY taken_at, created_at", {
    quoteId,
  });
}

export function getPhoto(db: Database, quoteId: string, photoId: string): Photo {
  const photo = queryOne(db, PhotoRow, "SELECT * FROM photos WHERE id = :photoId AND quote_id = :quoteId", {
    photoId,
    quoteId,
  });
  if (!photo) throw notFound("Photo introuvable");
  return photo;
}

export function findPhotoByClientId(db: Database, quoteId: string, clientPhotoId: string): Photo | undefined {
  return queryOne(db, PhotoRow, "SELECT * FROM photos WHERE quote_id = :quoteId AND client_photo_id = :clientPhotoId", {
    quoteId,
    clientPhotoId,
  });
}

export function insertPhoto(
  db: Database,
  photo: Pick<Photo, "id" | "quoteId" | "clientPhotoId" | "file" | "mimeType" | "sizeBytes" | "caption" | "takenAt">,
): void {
  const now = new Date().toISOString();
  execute(
    db,
    `INSERT INTO photos (id, quote_id, client_photo_id, file, mime_type, size_bytes, caption, taken_at, created_at, updated_at)
     VALUES (:id, :quoteId, :clientPhotoId, :file, :mimeType, :sizeBytes, :caption, :takenAt, :now, :now)`,
    { ...photo, now },
  );
}

export function updatePhoto(
  db: Database,
  photoId: string,
  update: PatchOf<Pick<Photo, "caption" | "visibleToClient">>,
): void {
  const set = buildSet({
    caption: update.caption,
    visible_to_client: update.visibleToClient === undefined ? undefined : Number(update.visibleToClient),
    updated_at: new Date().toISOString(),
  });
  execute(db, `UPDATE photos SET ${set.sql} WHERE id = :photoId`, { ...set.params, photoId });
}

export function deletePhoto(db: Database, photoId: string): void {
  execute(db, "DELETE FROM photos WHERE id = :photoId", { photoId });
}

/** Photo telle qu'exposée par l'API. */
export type PhotoView = Omit<Photo, "quoteId" | "file"> & { url: string };

export function toPhotoView(photo: Photo): PhotoView {
  const { quoteId, file: _file, ...rest } = photo;
  return { ...rest, url: `/api/quotes/${quoteId}/photos/${photo.id}/file` };
}
