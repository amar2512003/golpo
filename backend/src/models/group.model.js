import mongoose from "mongoose";
import crypto from "crypto";

export const MAX_GROUP_MEMBERS = 6;

function generateInviteCode() {
  return crypto.randomBytes(6).toString("hex");
}

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    groupPic: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Set once at creation and never changed — `admin` can be handed off
    // to someone else later, but "who created this group" shouldn't move
    // with it.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Shareable "join this group" token used by the invite link
    // (/invite/group/:inviteCode). Anyone holding a valid, non-full
    // group's code can join themselves — there's no admin approval step.
    // `sparse` so pre-existing groups without one yet (see the backfill
    // script) don't collide on the unique index before it's set.
    inviteCode: {
      type: String,
      unique: true,
      sparse: true,
      default: generateInviteCode,
    },
    // Per-member "I've read everything up to here" marker, keyed by user
    // id. Updated whenever that member opens the group's messages —
    // mirrors the `seen` flag on DM messages, just tracked per-group
    // instead of per-message since group reads aren't per-message here.
    lastReadBy: {
      type: Map,
      of: Date,
      default: {},
    },
  },
  { timestamps: true },
);

// Fast lookup of "which groups is this user in"
groupSchema.index({ members: 1 });

const Group = mongoose.model("Group", groupSchema);

export default Group;
