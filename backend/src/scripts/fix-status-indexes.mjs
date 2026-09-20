// Repairs the `statuses` collection's indexes.
//
// The first version of the status feature put a TTL index on `expiresAt`
// (auto-named `expiresAt_1`). The cleanup-job version needs that same
// field indexed *without* the TTL, because the row has to outlive expiry
// long enough for the sweep to read its ImageKit fileId. Mongo won't
// redefine an index under an existing name with different options, so the
// build fails — and a failed index build at cold start is what turns
// /api/status into a 500.
//
// The server now calls syncStatusIndexes() itself after connecting, so
// this script is only needed to fix a deployment by hand, or to confirm
// what's actually on the collection.
//
// Usage (from backend/):
//   node src/scripts/fix-status-indexes.mjs

import "dotenv/config";
import mongoose from "mongoose";
import Status, { syncStatusIndexes } from "../models/status.model.js";

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI is required (check your .env)");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log("Connected.\n");

  const collection = Status.collection;

  const before = await collection.indexes().catch(() => []);
  console.log("Indexes before:");
  before.forEach((index) =>
    console.log(
      `  ${index.name}`,
      index.expireAfterSeconds === undefined ? "" : `(TTL ${index.expireAfterSeconds}s)`,
    ),
  );

  console.log("\nSyncing...");
  await syncStatusIndexes();

  const after = await collection.indexes().catch(() => []);
  console.log("\nIndexes after:");
  after.forEach((index) =>
    console.log(
      `  ${index.name}`,
      index.expireAfterSeconds === undefined ? "" : `(TTL ${index.expireAfterSeconds}s)`,
    ),
  );

  await mongoose.disconnect();
  console.log("\nDone.");
}

run().catch((error) => {
  console.error("Failed:", error);
  process.exit(1);
});
