import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import Status from "../models/status.model.js";
import { hasImageKitConfig, uploadChatMedia } from "../lib/imagekit.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import { parseAudioDuration } from "../lib/voice.js";

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Validates a poll payload from the client and normalizes it into the
// shape the schema expects (question + 2-10 options, each starting with
// no votes). Returns null if the payload isn't usable.
function normalizePoll(poll) {
  if (!poll || typeof poll !== "object") return null;

  const question = (poll.question || "").trim();
  const options = Array.isArray(poll.options)
    ? poll.options
        .map((option) => (typeof option === "string" ? option : option?.text))
        .map((text) => (text || "").trim())
        .filter(Boolean)
    : [];

  if (!question || options.length < 2 || options.length > 10) return null;

  return {
    question,
    options: options.map((text) => ({ text, votes: [] })),
  };
}

// Privacy: there's no "browse everyone" endpoint any more. You can only
// find someone if you already know their exact email — this is an exact,
// case-insensitive match, not a partial/fuzzy search, so typing a few
// characters can't be used to enumerate other users.
export async function searchUserByEmail(req, res) {
  try {
    const loggedInUserId = req.user._id;
    const email = (req.query.email || "").trim();

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({
      _id: { $ne: loggedInUserId },
      email: new RegExp(`^${escapeRegex(email)}$`, "i"),
    }).select("-clerkId");

    if (!user) {
      return res.status(404).json({ message: "No user found with that email" });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Error in searchUserByEmail:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Backs invite share-links (`/invite/:userId`) — resolving one just needs
// enough of the target's profile to render the chat (name/avatar), not
// their email, so that's left out here even though searchUserByEmail
// returns it for the person who already typed it in themselves.
export async function getUserById(req, res) {
  try {
    const { id } = req.params;
    const loggedInUserId = req.user._id;

    if (String(id) === String(loggedInUserId)) {
      return res.status(400).json({ message: "That's your own invite link" });
    }

    const user = await User.findById(id).select("-clerkId -email");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Error in getUserById:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getConversationsForSidebar(req, res) {
  try {
    const loggedInUserId = req.user._id;

    const conversations = await Message.aggregate([
      // 1. Keep only the messages I sent or received.
      { $match: { $or: [{ senderId: loggedInUserId }, { receiverId: loggedInUserId }] } },
      // 2. Sort oldest-first so the $last accumulators below land on the
      // actual most recent message once grouped.
      { $sort: { createdAt: 1 } },
      // 3. Collapse them into one row per chat partner: our latest message
      // time, a preview of that last message, and how many of the
      // partner's messages to me are still unseen.
      {
        $group: {
          // The partner is the other person on the message (not me).
          _id: { $cond: [{ $eq: ["$senderId", loggedInUserId] }, "$receiverId", "$senderId"] },
          lastMessageAt: { $max: "$createdAt" },
          lastMessageText: { $last: "$text" },
          lastMessageImage: { $last: "$image" },
          lastMessageVideo: { $last: "$video" },
          lastMessageAudio: { $last: "$audio" },
          lastMessageIsSticker: { $last: "$isSticker" },
          lastMessagePollQuestion: { $last: "$poll.question" },
          lastMessageSenderId: { $last: "$senderId" },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$receiverId", loggedInUserId] },
                    { $eq: ["$seen", false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      // 4. Put the most recent conversation at the top.
      { $sort: { lastMessageAt: -1 } },
      // 5. Look up each partner's user profile (comes back as an array).
      { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
      // 6. Drop any conversation whose partner account no longer exists —
      // $replaceRoot below needs a real document, and without this a
      // single deleted account would throw and blank out every
      // conversation for this user, not just that one.
      { $match: { user: { $ne: [] } } },
      // 7. Pull that profile out of the array and make it the document,
      // keeping the last-message time and preview on it so the sidebar can
      // interleave DMs with group chats by recency and show a snippet.
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              { $first: "$user" },
              {
                lastMessageAt: "$lastMessageAt",
                unreadCount: "$unreadCount",
                lastMessage: {
                  text: "$lastMessageText",
                  image: "$lastMessageImage",
                  video: "$lastMessageVideo",
                  audio: "$lastMessageAudio",
                  isSticker: "$lastMessageIsSticker",
                  poll: { question: "$lastMessagePollQuestion" },
                  senderId: "$lastMessageSenderId",
                },
              },
            ],
          },
        },
      },
      // 8. Hide the private clerkId field from the result.
      { $project: { clerkId: 0 } },
    ]);

    res.status(200).json(conversations);
  } catch (error) {
    console.error("Error in getConversationsForSidebar:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getMessages(req, res) {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    }).sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    console.error("Error in getMessages:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Marks every message *from* :id *to* me as seen — called when I open
// that conversation (clears any backlog) and again whenever a new
// message arrives while it's already open. Tells the sender's socket
// so their ticks can flip from grey to blue without them reloading.
export async function markMessagesSeen(req, res) {
  try {
    const { id: otherUserId } = req.params;
    const myId = req.user._id;

    const result = await Message.updateMany(
      { senderId: otherUserId, receiverId: myId, seen: false },
      { $set: { seen: true, seenAt: new Date() } },
    );

    if (result.modifiedCount > 0) {
      const senderSocketId = getReceiverSocketId(otherUserId);
      if (senderSocketId) {
        // seenBy = me, the person whose messages (sent to me) just got read.
        io.to(senderSocketId).emit("messagesSeen", { seenBy: myId });
      }
    }

    res.status(200).json({ modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error("Error in markMessagesSeen:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function sendMessage(req, res) {
  try {
    const {
      text,
      imageUrl: providedImageUrl,
      isSticker: providedIsSticker,
      poll: providedPoll,
      statusReply: providedStatusReply,
    } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    // Stickers and GIFs are already-hosted images (a sticker pack asset or
    // a GIF picker result), so they're sent as a plain URL instead of a
    // file upload — no need to round-trip them through ImageKit.
    let imageUrl =
      typeof providedImageUrl === "string" && providedImageUrl.startsWith("http")
        ? providedImageUrl
        : undefined;
    let videoUrl;
    let audioUrl;
    let audioDuration;

    if (req.file) {
      if (!hasImageKitConfig()) {
        return res.status(500).json({ message: "Media upload is not configured" });
      }

      const url = await uploadChatMedia(req.file);
      if (req.file.mimetype.startsWith("video/")) videoUrl = url;
      else if (req.file.mimetype.startsWith("audio/")) {
        audioUrl = url;
        audioDuration = parseAudioDuration(req.body.audioDuration);
      } else imageUrl = url;
    }

    let poll;
    if (providedPoll) {
      poll = normalizePoll(providedPoll);
      if (!poll) {
        return res.status(400).json({ message: "A poll needs a question and at least 2 options" });
      }
    }

    // A status reply is a normal DM that just carries a tag saying which
    // status it's responding to. The client only sends the statusId —
    // the image/caption shown on the bubble come from the database, not
    // from the client, so a reply can't be spoofed to quote content that
    // was never actually posted.
    let statusReply;
    if (providedStatusReply?.statusId) {
      const status = await Status.findById(providedStatusReply.statusId);

      if (!status) {
        return res.status(404).json({ message: "That status is no longer available" });
      }

      // The status has to belong to the person you're replying to — this
      // is a DM route, so "reply to their status" and "send this message
      // to them" are the same recipient by construction.
      if (String(status.userId) !== String(receiverId)) {
        return res.status(400).json({ message: "That status doesn't belong to this conversation" });
      }

      if (!text?.trim()) {
        return res.status(400).json({ message: "Say something in your reply" });
      }

      statusReply = {
        statusId: status._id,
        image: status.image,
        caption: status.caption,
      };
    }

    // Only a real sticker-picker send counts — a plain image upload can't
    // claim to be a sticker just by setting the flag in the request body.
    const isSticker = Boolean(providedIsSticker) && Boolean(imageUrl);

    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
      isSticker,
      video: videoUrl,
      audio: audioUrl,
      audioDuration,
      poll,
      statusReply,
    });

    await newMessage.save();

    const receiverSocketId = getReceiverSocketId(receiverId);
    // only send the message in realtime if user is online
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.error("Error in sendMessage:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Casts (or retracts) a vote on a DM poll message. Single-choice: picking
// an option clears any other option the same user had voted for; picking
// the option you already voted for un-votes it. Only the two people on
// the conversation the poll belongs to can vote on it.
export async function voteOnPoll(req, res) {
  try {
    const { id: messageId } = req.params;
    const { optionIndex } = req.body;
    const userId = req.user._id;

    const message = await Message.findById(messageId);

    if (!message || !message.poll) {
      return res.status(404).json({ message: "Poll not found" });
    }

    if (
      String(message.senderId) !== String(userId) &&
      String(message.receiverId) !== String(userId)
    ) {
      return res.status(403).json({ message: "Not part of this conversation" });
    }

    const options = message.poll.options;
    if (
      typeof optionIndex !== "number" ||
      optionIndex < 0 ||
      optionIndex >= options.length
    ) {
      return res.status(400).json({ message: "Invalid poll option" });
    }

    const alreadyVotedHere = options[optionIndex].votes.some(
      (voterId) => String(voterId) === String(userId),
    );

    options.forEach((option) => {
      option.votes = option.votes.filter((voterId) => String(voterId) !== String(userId));
    });
    if (!alreadyVotedHere) options[optionIndex].votes.push(userId);

    await message.save();

    const otherUserId =
      String(message.senderId) === String(userId) ? message.receiverId : message.senderId;
    const otherSocketId = getReceiverSocketId(otherUserId);
    if (otherSocketId) {
      io.to(otherSocketId).emit("messagePollUpdated", message);
    }

    res.status(200).json(message);
  } catch (error) {
    console.error("Error in voteOnPoll:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}