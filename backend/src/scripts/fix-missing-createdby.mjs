// One-off migration: backfill `createdBy` on Group documents that predate
// the field (or otherwise never got it set). Without this, any group.save()
// call on these docs fails full-document validation with:
//   "Group validation failed: createdBy: Path `createdBy` is required."
// which is what's breaking makeAdmin / leaveGroup / removeMember for
// affected groups.
//
// We default createdBy to the group's current `admin`, since that's the
// closest available substitute for "who created this group" when the
// original creator wasn't recorded.
//
// Usage (from backend/):
//   node src/scripts/fix-missing-createdby.mjs

import "dotenv/config";
import mongoose from "mongoose";
import Group from "../models/group.model.js";

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI is required (check your .env)");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB");

  // Query the raw collection (bypassing schema/validation) so we can find
  // documents that are missing the field, even though the schema now
  // declares it required.
  const affected = await Group.collection
    .find({ $or: [{ createdBy: { $exists: false } }, { createdBy: null }] })
    .toArray();

  console.log(`Found ${affected.length} group(s) missing createdBy`);

  for (const doc of affected) {
    if (!doc.admin) {
      console.warn(`  Skipping ${doc._id} — no admin field to fall back to either`);
      continue;
    }
    await Group.collection.updateOne(
      { _id: doc._id },
      { $set: { createdBy: doc.admin } },
    );
    console.log(`  Fixed ${doc._id} -> createdBy = ${doc.admin}`);
  }

  console.log("Done.");
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
