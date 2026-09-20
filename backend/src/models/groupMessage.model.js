import mongoose from "mongoose";

// A real subdocument schema (rather than a bare object literal) so it can
// be given `default: undefined` below — without that, Mongoose
// auto-vivifies the nested `options` array to `[]` on every message,
// making `poll` a truthy `{ options: [] }` even when no poll was sent.
const pollSchema = new mongoose.Schema(
  {
    question: { type: String },
    options: [
      {
        text: { type: String },
        votes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      },
    ],
  },
  { _id: false },
);

const groupMessageSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
    },
    image: {
      type: String,
    },
    video: {
      type: String,
    },
    // Voice notes: URL of the recorded clip + its length in seconds (the
    // recorder's own duration, since MediaRecorder files often lack duration
    // metadata and the player can't read it back from the file).
    audio: {
      type: String,
    },
    audioDuration: {
      type: Number,
    },
    // Polls: a question plus 2+ options, each tracking which users voted
    // for it. Single-choice — voting for a new option clears any previous
    // vote by the same user (enforced in the controller, not the schema).
    // `default: undefined` keeps this field entirely absent on messages
    // that aren't polls, instead of Mongoose filling in an empty shell.
    poll: { type: pollSchema, default: undefined },
  },
  { timestamps: true },
);

groupMessageSchema.index({ groupId: 1, createdAt: 1 });

const GroupMessage = mongoose.model("GroupMessage", groupMessageSchema);

export default GroupMessage;
