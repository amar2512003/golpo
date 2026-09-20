import Status, { STATUS_TTL_MS } from "../models/status.model.js";
import Message from "../models/message.model.js";
import Group from "../models/group.model.js";
import { deleteMediaFile, hasImageKitConfig, uploadMedia } from "../lib/imagekit.js";
import { cleanupExpiredStatusesFully } from "../lib/statusCleanup.js";
import { emitToUsers } from "../lib/socket.js";

const MAX_STATUSES_PER_USER = 30;

// Logs the whole error (stack included, not just the message) and sends
// the standard 500. Set DEBUG_STATUS=true in the environment to also get
// the underlying reason back in the response body, which is the only way
// to see it from the browser on a host where the logs aren't to hand.
function failWithServerError(res, where, error) {
  console.error(`Error in ${where}:`, error);

  const body = { message: "Internal server error" };
  if (process.env.DEBUG_STATUS === "true") body.detail = error?.message;

  res.status(500).json(body);
}

// Statuses aren't public. The audience is exactly the people you already
// have a thread with — anyone you've exchanged a DM with, plus everyone
// in a group you're both in. Same privacy stance as the rest of the app:
// there's no browsing strangers, so there's no broadcasting to them
// either.
async function getContactIds(userId) {
  const [dmPartnerIds, groups] = await Promise.all([
    Message.aggregate([
      { $match: { $or: [{ senderId: userId }, { receiverId: userId }] } },
      {
        $group: {
          _id: null,
          ids: {
            $addToSet: {
              $cond: [{ $eq: ["$senderId", userId] }, "$receiverId", "$senderId"],
            },
          },
        },
      },
    ]),
    Group.find({ members: userId }).select("members"),
  ]);

  const contactIds = new Set();

  dmPartnerIds[0]?.ids?.forEach((id) => contactIds.add(String(id)));
  groups.forEach((group) => {
    group.members.forEach((memberId) => contactIds.add(String(memberId)));
  });

  contactIds.delete(String(userId)); // never count yourself as a contact

  return [...contactIds];
}

// Collapses a flat list of status documents into one bucket per author —
// the shape the story tray wants: an avatar, that person's statuses in
// order, and whether any of them are still unseen by me (which is what
// decides the glowing ring).
function groupStatusesByUser(statuses, viewerId) {
  const buckets = new Map();

  statuses.forEach((status) => {
    const author = status.userId;
    if (!author?._id) return; // author account was deleted

    const key = String(author._id);

    if (!buckets.has(key)) {
      buckets.set(key, {
        userId: key,
        fullName: author.fullName,
        profilePic: author.profilePic,
        statuses: [],
        hasUnseen: false,
        lastStatusAt: status.createdAt,
      });
    }

    const bucket = buckets.get(key);
    const isMine = key === String(viewerId);

    // viewers.userId is populated for the seen-by list, so compare against
    // the nested _id when it's a document rather than a raw ObjectId.
    const seenByMe =
      isMine ||
      status.viewers.some(
        (viewer) => String(viewer.userId?._id || viewer.userId) === String(viewerId),
      );

    bucket.statuses.push({
      _id: status._id,
      image: status.image,
      caption: status.caption,
      createdAt: status.createdAt,
      expiresAt: status.expiresAt,
      seenByMe,
      // Only the author gets to see who watched — everyone else just
      // gets a count-free view of their own status.
      viewers: isMine ? status.viewers : undefined,
      viewerCount: isMine ? status.viewers.length : undefined,
    });

    if (!seenByMe) bucket.hasUnseen = true;
    if (status.createdAt > bucket.lastStatusAt) bucket.lastStatusAt = status.createdAt;
  });

  return [...buckets.values()];
}

// Everything live right now: my own statuses (so I can review/delete
// them) plus my contacts'. Unseen authors float to the top, then most
// recently updated first — the ordering a story tray is expected to have.
export async function getStatusFeed(req, res) {
  try {
    const myId = req.user._id;
    const contactIds = await getContactIds(myId);

    const statuses = await Status.find({
      userId: { $in: [myId, ...contactIds] },
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: 1 })
      .populate("userId", "fullName profilePic")
      // Only the author is shown their viewer list (see groupStatusesByUser),
      // but populating here keeps it to a single round trip.
      .populate("viewers.userId", "fullName profilePic");

    const buckets = groupStatusesByUser(statuses, myId);

    const mine = buckets.find((bucket) => bucket.userId === String(myId)) || null;
    const others = buckets
      .filter((bucket) => bucket.userId !== String(myId))
      .sort((a, b) => {
        if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
        return new Date(b.lastStatusAt) - new Date(a.lastStatusAt);
      });

    res.status(200).json({ mine, others });
  } catch (error) {
    failWithServerError(res, "getStatusFeed", error);
  }
}

// Posts an image status. Accepts either an uploaded file (the usual
// path) or an already-hosted image URL, mirroring how sendMessage
// handles GIFs and stickers.
export async function createStatus(req, res) {
  try {
    const myId = req.user._id;
    const caption = (req.body.caption || "").trim();

    let imageUrl =
      typeof req.body.imageUrl === "string" && req.body.imageUrl.startsWith("http")
        ? req.body.imageUrl
        : undefined;

    // Only uploads we made ourselves have a fileId — an externally hosted
    // URL isn't ours to delete, so it simply has nothing to clean up.
    let fileId = "";

    if (req.file) {
      if (!req.file.mimetype.startsWith("image/")) {
        return res.status(400).json({ message: "A status has to be an image" });
      }
      if (!hasImageKitConfig()) {
        return res.status(500).json({ message: "Media upload is not configured" });
      }
      const uploaded = await uploadMedia(req.file, { folder: "/status" });
      imageUrl = uploaded.url;
      fileId = uploaded.fileId || "";
    }

    if (!imageUrl) {
      return res.status(400).json({ message: "Pick an image to post" });
    }

    // A soft cap so one account can't fill its contacts' trays. Oldest
    // live status drops off to make room, same as the 24h expiry would
    // have done eventually.
    const liveCount = await Status.countDocuments({
      userId: myId,
      expiresAt: { $gt: new Date() },
    });

    if (liveCount >= MAX_STATUSES_PER_USER) {
      const oldest = await Status.findOne({ userId: myId, expiresAt: { $gt: new Date() } }).sort({
        createdAt: 1,
      });
      if (oldest) {
        // Same rule as expiry: the asset goes before the row does.
        await deleteMediaFile(oldest.fileId).catch((error) =>
          console.error("Couldn't delete evicted status file:", error.message),
        );
        await oldest.deleteOne();
      }
    }

    const status = await Status.create({
      userId: myId,
      image: imageUrl,
      fileId,
      caption,
      expiresAt: new Date(Date.now() + STATUS_TTL_MS),
    });

    const payload = {
      _id: status._id,
      image: status.image,
      caption: status.caption,
      createdAt: status.createdAt,
      expiresAt: status.expiresAt,
      user: {
        _id: myId,
        fullName: req.user.fullName,
        profilePic: req.user.profilePic,
      },
    };

    // Contacts get the ring lit up immediately; my own other tabs get it
    // too so the tray stays consistent across devices. The status is
    // already saved at this point, so a failure here must not turn a
    // successful post into a 500 — the worst case is that someone's ring
    // waits until their next feed refresh.
    try {
      const contactIds = await getContactIds(myId);
      emitToUsers([...contactIds, myId], "status:new", payload);
    } catch (error) {
      console.error("Couldn't notify contacts about new status:", error.message);
    }

    res.status(201).json(payload);
  } catch (error) {
    failWithServerError(res, "createStatus", error);
  }
}

// Marks one status as watched by me. Idempotent — reopening someone's
// status doesn't add a second viewer entry or move the original time.
export async function markStatusSeen(req, res) {
  try {
    const { id: statusId } = req.params;
    const myId = req.user._id;

    const status = await Status.findOne({
      _id: statusId,
      expiresAt: { $gt: new Date() },
    });

    if (!status) {
      return res.status(404).json({ message: "That status is no longer available" });
    }

    // Viewing your own status isn't a view.
    if (String(status.userId) === String(myId)) {
      return res.status(200).json({ ok: true });
    }

    // Only the author's contacts can see (and therefore mark) a status.
    const contactIds = await getContactIds(status.userId);
    if (!contactIds.includes(String(myId))) {
      return res.status(403).json({ message: "You can't view this status" });
    }

    const alreadySeen = status.viewers.some(
      (viewer) => String(viewer.userId) === String(myId),
    );

    if (!alreadySeen) {
      status.viewers.push({ userId: myId, seenAt: new Date() });
      await status.save();

      // Let the author's own tabs update their "seen by" count live.
      emitToUsers([status.userId], "status:seen", {
        statusId: String(status._id),
        viewer: {
          _id: String(myId),
          fullName: req.user.fullName,
          profilePic: req.user.profilePic,
        },
        seenAt: new Date(),
      });
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    failWithServerError(res, "markStatusSeen", error);
  }
}

// Take one of my own statuses down early, before the 24h window closes.
export async function deleteStatus(req, res) {
  try {
    const { id: statusId } = req.params;
    const myId = req.user._id;

    const status = await Status.findById(statusId);

    if (!status) {
      return res.status(404).json({ message: "Status not found" });
    }

    if (String(status.userId) !== String(myId)) {
      return res.status(403).json({ message: "You can only delete your own status" });
    }

    // Taking a status down early should free the storage immediately
    // rather than waiting for a sweep that would no longer see this row.
    // A failure here isn't fatal for the user's request — log it and let
    // the asset be tidied by hand if it ever matters.
    await deleteMediaFile(status.fileId).catch((error) =>
      console.error("Couldn't delete status file:", error.message),
    );

    await status.deleteOne();

    const contactIds = await getContactIds(myId);
    emitToUsers([...contactIds, myId], "status:deleted", {
      statusId: String(statusId),
      userId: String(myId),
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    failWithServerError(res, "deleteStatus", error);
  }
}

// Cleanup sweep for serverless deployments, where there's no long-lived
// process to hold the cron in lib/cron.js. Point a scheduled job at
// POST /api/status/cleanup with `Authorization: Bearer <CRON_SECRET>`.
// Disabled unless CRON_SECRET is set, so it can't be called anonymously.
export async function runStatusCleanup(req, res) {
  try {
    const secret = process.env.CRON_SECRET;

    if (!secret) {
      return res.status(404).json({ message: "Not found" });
    }

    const provided =
      req.get("authorization")?.replace(/^Bearer /i, "") || req.get("x-cron-secret");

    if (provided !== secret) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const result = await cleanupExpiredStatusesFully();

    res.status(200).json(result);
  } catch (error) {
    failWithServerError(res, "runStatusCleanup", error);
  }
}
