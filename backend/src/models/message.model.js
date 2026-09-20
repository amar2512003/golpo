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

// Same reasoning as pollSchema above: a real subdocument so
// `default: undefined` actually keeps this field absent on ordinary
// messages instead of Mongoose auto-vivifying an empty `{}`.
const statusReplySchema = new mongoose.Schema(
  {
    statusId: { type: mongoose.Schema.Types.ObjectId, ref: "Status" },
    // A copy of the status's image/caption at reply time, not a live
    // reference — the status itself expires and gets deleted within a
    // day, but the reply should keep showing what was replied to.
    image: { type: String },
    caption: { type: String },
  },
  { _id: false },
);

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
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
    // Set when this message was sent from a status viewer's reply box —
    // a normal DM, just tagged with which status (and a snapshot of its
    // image/caption) it was replying to, so the bubble can show a small
    // quoted preview above the text.
    statusReply: { type: statusReplySchema, default: undefined },
    seen: {
      type: Boolean,
      default: false,
    },
    seenAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

const Message = mongoose.model("Message", messageSchema);

export default Message;