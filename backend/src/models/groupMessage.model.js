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
  },
  { timestamps: true },
);

groupMessageSchema.index({ groupId: 1, createdAt: 1 });

const GroupMessage = mongoose.model("GroupMessage", groupMessageSchema);

export default GroupMessage;
