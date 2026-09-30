import { estimateReadyTimes, type ClipEstimateOptions, type UnfinishedClip } from "../domain/clip-estimate.js";
import type { Database } from "../db/database.js";
import { listUnfinishedClips, type ClipStatus } from "../repositories/clips.js";

/** Fin estimée de chaque dictée non terminée, recalculée à chaque lecture (quelques lignes en base). */
export type ClipEstimator = () => Map<string, Date>;

const isUnfinished = (status: ClipStatus): status is UnfinishedClip["status"] =>
  status !== "done" && status !== "failed";

export function createClipEstimator(db: Database, options: ClipEstimateOptions): ClipEstimator {
  return () => {
    const clips: UnfinishedClip[] = [];
    for (const clip of listUnfinishedClips(db)) {
      const { status } = clip;
      if (!isUnfinished(status)) continue;
      clips.push({
        id: clip.id,
        quoteId: clip.quoteId,
        status,
        durationMs: clip.durationMs,
        updatedAt: new Date(clip.updatedAt),
      });
    }
    return estimateReadyTimes(clips, new Date(), options);
  };
}
