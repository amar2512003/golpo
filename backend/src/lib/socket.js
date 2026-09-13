import express from "express";
import http from "http";
import { Server } from "socket.io";

import Group, { MAX_GROUP_MEMBERS } from "../models/group.model.js";

const app = express();

const server = http.createServer(app);

const allowedOrigin =
  process.env.FRONTEND_URL || "http://localhost:5173";

const io = new Server(server, {
  path: "/socket.io",
  cors: {
    origin: allowedOrigin,
    credentials: true,
    methods: ["GET", "POST"],
  },
});

const userSocketMap = {};

// groupId -> Map<userId, { socketId, callType }>
// Tracks who is actively "in call" for a group, separate from group
// membership. A group can have many members but only some of them may
// be on the call at a given moment.
const activeCallParticipants = new Map();

function getReceiverSocketId(userId) {
  return userSocketMap[userId];
}

function getCallRoomId(groupId) {
  return `call:${groupId}`;
}

function getCallParticipants(groupId) {
  return activeCallParticipants.get(groupId);
}

// Drops one user out of a group's call room without ending it for
// anyone else — used when group membership changes (kicked, left,
// admin removed them) for a user who happens to still be on the call.
// Looks up their live socket itself since callers here (REST
// controllers) don't have one handy the way the socket.io event
// handlers above do.
function removeUserFromGroupCall(groupId, userId) {
  const targetSocketId = getReceiverSocketId(userId);
  const targetSocket = targetSocketId && io.sockets.sockets.get(targetSocketId);
  leaveCallRoom(groupId, userId, targetSocket);
}

// Ends an in-progress group call for everyone on it — used both by the
// explicit call:group-end socket event and by deleteGroup (a group that
// no longer exists can't have anyone left on a call for it).
function endCallForGroup(groupId) {
  const participants = activeCallParticipants.get(groupId);
  if (!participants) return;

  const roomId = getCallRoomId(groupId);

  io.to(roomId).emit("call:group-ended", { groupId });

  participants.forEach(({ socketId }) => {
    io.sockets.sockets.get(socketId)?.leave(roomId);
  });

  activeCallParticipants.delete(groupId);
}

// Removes a user from a group call's participant map and room, and
// lets the rest of the mesh know so they can tear down that one peer
// connection. No-ops quietly if the user wasn't actually in the call.
function leaveCallRoom(groupId, uid, sock) {
  if (!groupId || !uid) return;

  const participants = activeCallParticipants.get(groupId);
  const key = uid.toString();

  if (!participants || !participants.has(key)) return;

  participants.delete(key);
  sock?.leave(getCallRoomId(groupId));

  if (participants.size === 0) {
    activeCallParticipants.delete(groupId);
  }

  io.to(getCallRoomId(groupId)).emit("call:group-user-left", {
    groupId,
    userId: key,
  });
}

// Puts a single online socket into the Socket.IO room for every group
// that user belongs to, so io.to(groupId).emit(...) reaches them.
// Called on connect, and again whenever group membership changes
// (create group, add member) so it takes effect without a reconnect.
async function joinUserToGroupRooms(userId, socketId) {
  const targetSocketId = socketId || getReceiverSocketId(userId);
  const targetSocket = targetSocketId && io.sockets.sockets.get(targetSocketId);

  if (!targetSocket) {
    return;
  }

  try {
    const groups = await Group.find({ members: userId }).select("_id");
    groups.forEach((group) => {
      targetSocket.join(group._id.toString());
    });
  } catch (error) {
    console.error("Error joining group rooms:", error.message);
  }
}

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  const userId = socket.handshake.query.userId;

  if (userId) {
    userSocketMap[userId] = socket.id;
    joinUserToGroupRooms(userId, socket.id);
  }

  io.emit(
    "getOnlineUsers",
    Object.keys(userSocketMap)
  );

  // ---------------- WebRTC Signaling ----------------

  // groupId is only present for group mesh calls — it's what lets the
  // frontend tell "this offer is for my group call" apart from a fresh
  // 1:1 incoming call, without guessing from fromUserId alone.
  socket.on(
    "call:offer",
    ({ toUserId, fromUserId, offer, callType, groupId }) => {
      const targetSocketId =
        getReceiverSocketId(toUserId);

      if (targetSocketId) {
        io.to(targetSocketId).emit("call:offer", {
          fromUserId: fromUserId || userId,
          offer,
          callType,
          groupId,
        });
      }
    }
  );

  // fromUserId is optional for 1:1 calls (the receiver only has one
  // possible caller), but required for group mesh calls where a peer
  // may have several RTCPeerConnections open at once and needs to know
  // which one this answer belongs to. Defaults to the sender's own id
  // so group frontends always get it without every 1:1 call site
  // needing to change.
  socket.on(
    "call:answer",
    ({ toUserId, answer, fromUserId, groupId }) => {
      const targetSocketId =
        getReceiverSocketId(toUserId);

      if (targetSocketId) {
        io.to(targetSocketId).emit(
          "call:answer",
          {
            answer,
            fromUserId: fromUserId || userId,
            groupId,
          }
        );
      }
    }
  );

  socket.on(
    "call:ice-candidate",
    ({ toUserId, candidate, fromUserId, groupId }) => {
      const targetSocketId =
        getReceiverSocketId(toUserId);

      if (targetSocketId) {
        io.to(targetSocketId).emit(
          "call:ice-candidate",
          {
            candidate,
            fromUserId: fromUserId || userId,
            groupId,
          }
        );
      }
    }
  );

  socket.on(
    "call:end",
    ({ toUserId }) => {
      const targetSocketId =
        getReceiverSocketId(toUserId);

      if (targetSocketId) {
        io.to(targetSocketId).emit("call:end");
      }
    }
  );

  socket.on(
    "call:reject",
    ({ toUserId }) => {
      const targetSocketId =
        getReceiverSocketId(toUserId);

      if (targetSocketId) {
        io.to(targetSocketId).emit("call:reject");
      }
    }
  );

  // ---------------- Group Call Signaling (mesh) ----------------
  //
  // Group calls layer on top of 1:1 signaling: call:offer/answer/
  // ice-candidate above are reused as-is (now carrying fromUserId) to
  // set up each pairwise RTCPeerConnection. These handlers only manage
  // *who's in the call room* — join, leave, and the 6-person cap —
  // separately from group chat membership.

  socket.on(
    "call:group-join",
    async ({ groupId, callType = "video" }, callback) => {
      try {
        if (!userId || !groupId) {
          return callback?.({ error: "Missing groupId" });
        }

        const group = await Group.findById(groupId).select("members");

        if (!group) {
          return callback?.({ error: "Group not found" });
        }

        if (!group.members.some((memberId) => memberId.toString() === userId.toString())) {
          return callback?.({ error: "Not a member of this group" });
        }

        let participants = activeCallParticipants.get(groupId);
        if (!participants) {
          participants = new Map();
          activeCallParticipants.set(groupId, participants);
        }

        const key = userId.toString();

        if (!participants.has(key) && participants.size >= MAX_GROUP_MEMBERS) {
          return callback?.({
            error: `Calls are limited to ${MAX_GROUP_MEMBERS} participants`,
          });
        }

        // Snapshot existing participants (before adding self) so the
        // joiner knows who to open a peer connection + send an offer to.
        const existingParticipants = Array.from(participants.entries())
          .filter(([id]) => id !== key)
          .map(([id, info]) => ({ userId: id, callType: info.callType }));

        participants.set(key, { socketId: socket.id, callType });
        socket.join(getCallRoomId(groupId));

        callback?.({ participants: existingParticipants });

        // Let everyone already on the call know to expect an incoming
        // offer from the new joiner.
        socket.to(getCallRoomId(groupId)).emit("call:group-user-joined", {
          groupId,
          userId: key,
          callType,
        });
      } catch (error) {
        console.error("Error in call:group-join:", error.message);
        callback?.({ error: "Internal server error" });
      }
    }
  );

  socket.on("call:group-leave", ({ groupId }) => {
    leaveCallRoom(groupId, userId, socket);
  });

  // Broadcasts a local mute/camera toggle to the rest of the call room
  // so their tiles can show an accurate badge for this user. Purely
  // informational — it doesn't touch the actual media tracks, which
  // are controlled peer-to-peer.
  socket.on("call:group-media-state", ({ groupId, muted, cameraOff }) => {
    if (!groupId || !userId) return;

    socket.to(getCallRoomId(groupId)).emit("call:group-media-state", {
      groupId,
      userId: userId.toString(),
      muted,
      cameraOff,
    });
  });

  // Ends the call for every current participant (e.g. the last person
  // leaving, or a forced end), rather than tearing down one peer.
  socket.on("call:group-end", ({ groupId }) => endCallForGroup(groupId));

  // ---------------- Disconnect ----------------

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);

    if (userId) {
      delete userSocketMap[userId];

      // If this socket dropped mid-call, tell the rest of the mesh so
      // they tear down that one peer connection instead of hanging on
      // a dead connection until ICE eventually times out.
      activeCallParticipants.forEach((participants, groupId) => {
        if (participants.has(userId.toString())) {
          leaveCallRoom(groupId, userId, socket);
        }
      });
    }

    io.emit(
      "getOnlineUsers",
      Object.keys(userSocketMap)
    );
  });
});

export {
  app,
  server,
  io,
  getReceiverSocketId,
  joinUserToGroupRooms,
  getCallParticipants,
  endCallForGroup,
  removeUserFromGroupCall,
};