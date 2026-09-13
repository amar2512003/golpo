import mongoose from "mongoose";

export const MAX_GROUP_MEMBERS = 6;

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
  },
  { timestamps: true },
);

// Fast lookup of "which groups is this user in"
groupSchema.index({ members: 1 });

const Group = mongoose.model("Group", groupSchema);

export default Group;
