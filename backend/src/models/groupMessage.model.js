import mongoose from "mongoose";

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
    poll: {
      question: { type: String },
      options: [
        {
          text: { type: String },
          votes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        },
      ],
    },
  },
  { timestamps: true },
);

groupMessageSchema.index({ groupId: 1, createdAt: 1 });

const GroupMessage = mongoose.model("GroupMessage", groupMessageSchema);

export default GroupMessage;
