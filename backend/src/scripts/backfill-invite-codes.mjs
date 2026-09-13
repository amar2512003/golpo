// One-off migration: backfill `inviteCode` on Group documents that
// predate the group-invite-link feature. Without this, those groups
// have no way to be joined via a link until someone edits them (which
// wouldn't set it either) — the schema default only applies to newly
// created documents.
//
// Usage (from backend/):
//   node src/scripts/backfill-invite-codes.mjs

import "dotenv/config";
import crypto from "crypto";
import mongoose from "mongoose";
import Group from "../models/group.model.js";

function generateInviteCode() {
  return crypto.randomBytes(6).toString("hex");
}

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI is required (check your .env)");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB");

  const affected = await Group.collection
    .find({ $or: [{ inviteCode: { $exists: false } }, { inviteCode: null }] })
    .toArray();

  console.log(`Found ${affected.length} group(s) missing inviteCode`);

  for (const doc of affected) {
    // Codes are 12 hex chars from a 6-byte random source — collisions
    // are astronomically unlikely, but retry on the off chance the
    // unique index rejects one anyway.
    let saved = false;
    for (let attempt = 0; attempt < 5 && !saved; attempt++) {
      try {
        await Group.collection.updateOne(
          { _id: doc._id },
          { $set: { inviteCode: generateInviteCode() } },
        );
        saved = true;
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }
    if (saved) {
      console.log(`  Fixed ${doc._id}`);
    } else {
      console.warn(`  Skipping ${doc._id} — couldn't find a free invite code`);
    }
  }

  console.log("Done.");
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
