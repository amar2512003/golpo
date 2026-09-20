import Status, { MAX_CLEANUP_ATTEMPTS } from "../models/status.model.js";
import { deleteMediaFile, hasImageKitConfig } from "./imagekit.js";

// Statuses live 24 hours. Expiry itself is enforced on every read, so
// this job isn't what makes a status disappear from the app — it's what
// stops the images piling up in ImageKit once they're past that point.
//
// Order matters: delete the asset first, then the row. Doing it the other
// way (or letting a Mongo TTL index drop the row) loses the fileId and
// orphans the image with nothing left pointing at it.

const BATCH_SIZE = 100;

// Guards against overlapping runs — the interval keeps firing even if a
// slow ImageKit response makes one pass outlast its window.
let isRunning = false;

export async function cleanupExpiredStatuses({ batchSize = BATCH_SIZE } = {}) {
  if (isRunning) return { skipped: true };
  isRunning = true;

  const summary = { filesDeleted: 0, statusesDeleted: 0, failed: 0 };

  try {
    const expired = await Status.find({ expiresAt: { $lte: new Date() } })
      .select("_id fileId cleanupAttempts")
      .limit(batchSize);

    if (expired.length === 0) return summary;

    for (const status of expired) {
      // Nothing to delete remotely (an externally hosted image, or an
      // upload from before fileId was tracked) — just drop the row.
      if (!status.fileId || !hasImageKitConfig()) {
        await status.deleteOne();
        summary.statusesDeleted += 1;
        continue;
      }

      try {
        // Resolves quietly if the asset is already gone.
        await deleteMediaFile(status.fileId);
        await status.deleteOne();
        summary.filesDeleted += 1;
        summary.statusesDeleted += 1;
      } catch (error) {
        summary.failed += 1;

        const attempts = (status.cleanupAttempts || 0) + 1;

        if (attempts >= MAX_CLEANUP_ATTEMPTS) {
          // Give up rather than retrying forever. Logged loudly with the
          // fileId so the asset can be removed by hand if it matters.
          console.error(
            `Giving up on ImageKit file ${status.fileId} after ${attempts} attempts:`,
            error.message,
          );
          await status.deleteOne();
          summary.statusesDeleted += 1;
        } else {
          status.cleanupAttempts = attempts;
          await status.save();
          console.error(
            `Status cleanup failed for file ${status.fileId} (attempt ${attempts}):`,
            error.message,
          );
        }
      }
    }

    console.log(
      `[status-cleanup] removed ${summary.statusesDeleted} status(es), ${summary.filesDeleted} file(s), ${summary.failed} failure(s)`,
    );

    return summary;
  } catch (error) {
    console.error("Error in cleanupExpiredStatuses:", error.message);
    return summary;
  } finally {
    isRunning = false;
  }
}

// Works through the backlog rather than stopping at one batch — matters
// on the first run after the job has been off for a while.
export async function cleanupExpiredStatusesFully({ maxBatches = 20 } = {}) {
  const totals = { filesDeleted: 0, statusesDeleted: 0, failed: 0 };

  for (let pass = 0; pass < maxBatches; pass += 1) {
    const result = await cleanupExpiredStatuses();
    if (result.skipped) break;

    totals.filesDeleted += result.filesDeleted;
    totals.statusesDeleted += result.statusesDeleted;
    totals.failed += result.failed;

    // A short batch means the backlog is drained.
    if (result.statusesDeleted + result.failed < BATCH_SIZE) break;
  }

  return totals;
}
