import mongoose from "mongoose";

// How long a status stays up before MongoDB reaps it.
export const STATUS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// How long the document itself is kept past expiry as a safety net (see
// the purgeAfter field below). The cleanup job normally removes it within
// minutes of the 24h mark; this only matters if that job is down.
export const STATUS_PURGE_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Give up on deleting a stubborn ImageKit asset after this many cleanup
// passes and drop the row anyway, so one bad file can't wedge the job.
export const MAX_CLEANUP_ATTEMPTS = 5;

// Who has opened this status, and when. Stored as subdocuments (rather
// than a bare array of user ids) so the owner's "seen by" list can show
// a time next to each viewer without a second collection.
const viewerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    seenAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const statusSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Statuses are image-only by design — an already-hosted ImageKit URL,
    // uploaded through the same pipeline chat media uses.
    image: {
      type: String,
      required: true,
    },
    caption: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200,
    },
    viewers: {
      type: [viewerSchema],
      default: [],
    },
    // The ImageKit fileId for the image above. Kept so the asset can
    // actually be deleted when the status expires — a URL alone isn't
    // enough to call the delete API with.
    fileId: {
      type: String,
      default: "",
    },
    // Set to createdAt + 24h on insert. Every read filters on this, so a
    // status is never served past its 24 hours regardless of when the
    // cleanup job last ran.
    //
    // Deliberately *not* a TTL index: Mongo would drop the document the
    // moment it expired, taking the fileId with it and orphaning the image
    // in ImageKit forever. The cleanup job (lib/statusCleanup.js) deletes
    // the asset first, then the row.
    expiresAt: {
      type: Date,
      required: true,
    },
    // Backstop for the above: if the cleanup job is down for a week,
    // this TTL index reaps the row anyway. That can orphan the ImageKit
    // asset, which is why the grace period is generous — it's a last
    // resort, not the normal path.
    purgeAfter: {
      type: Date,
    },
    // Bumped each time cleanup fails to delete this status's asset, so a
    // permanently un-deletable file eventually gets dropped instead of
    // being retried forever.
    cleanupAttempts: {
      type: Number,
      default: 0,
    },
  },
  // autoIndex is off on purpose. Mongoose would otherwise try to build
  // these indexes on the first use of the model after every cold start,
  // and a build that fails there takes the request down with it. Indexes
  // are managed explicitly by syncStatusIndexes() below instead.
  { timestamps: true, autoIndex: false },
);

// Every index is named explicitly. Mongo refuses to create an index whose
// name already exists with different options, and auto-generated names
// (expiresAt_1 and friends) collide with whatever a previous version of
// this schema created — which is exactly the kind of failure that's
// invisible until the first write. Distinct names plus syncIndexes()
// make a schema change here self-correcting.

// The feed query is always "these users' live statuses, oldest first".
statusSchema.index({ userId: 1, createdAt: 1 }, { name: "status_user_created" });

// Drives the cleanup sweep's "what's expired?" scan. Plain, NOT a TTL
// index — see the note on expiresAt above.
statusSchema.index({ expiresAt: 1 }, { name: "status_expiry_scan" });

// The 7-day backstop TTL.
statusSchema.index({ purgeAfter: 1 }, { name: "status_purge_ttl", expireAfterSeconds: 0 });

// Derive purgeAfter from expiresAt so callers only ever set one date and
// the two can't drift apart.
statusSchema.pre("validate", function setPurgeAfter(next) {
  if (this.expiresAt) {
    this.purgeAfter = new Date(this.expiresAt.getTime() + STATUS_PURGE_GRACE_MS);
  }
  next();
});

const Status = mongoose.model("Status", statusSchema);

// Brings the collection's indexes in line with the schema above: creates
// what's missing and drops what's no longer declared — including any
// leftover index from an earlier version of this model, such as the TTL
// index that used to sit on expiresAt.
//
// Runs once per process, after the DB connection is up. Failure is
// logged and swallowed: indexes are an optimisation and a backstop here,
// and not having them is far better than a status feature that 500s.
let indexSyncPromise = null;

export function syncStatusIndexes() {
  if (!indexSyncPromise) {
    indexSyncPromise = Status.syncIndexes()
      .then((droppedIndexes) => {
        if (droppedIndexes?.length) {
          console.log("[status] replaced stale indexes:", droppedIndexes.join(", "));
        }
      })
      .catch((error) => {
        console.error("[status] index sync failed:", error.message);
      });
  }

  return indexSyncPromise;
}

export default Status;
