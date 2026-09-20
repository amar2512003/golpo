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

// userId -> Set<socketId>. A user can have more than one live socket at
// once (multiple tabs, phone + laptop, a refresh that hasn't torn down
// the old socket yet), so presence has to be reference-counted per user
// rather than overwritten by whichever socket connected last.
const userSocketMap = {};

function addUserSocket(userId, socketId) {
  if (!userSocketMap[userId]) userSocketMap[userId] = new Set();
  userSocketMap[userId].add(socketId);
}

// Only clears the user's presence once their last socket is gone, so
// closing/refreshing one tab doesn't mark them offline while another
// tab or device is still connected.
function removeUserSocket(userId, socketId) {
  const sockets = userSocketMap[userId];
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) delete userSocketMap[userId];
}

// groupId -> Map<userId, { socketId, callType, sharingScreen }>
// Tracks who is actively "in call" for a group, separate from group
// membership. A group can have many members but only some of them may
// be on the call at a given moment.
const activeCallParticipants = new Map();

// Returns one live socket id for this user, for the 1:1 signaling paths
// that only need to reach "a" device (e.g. ringing). Arbitrary which one
// if there are several — those paths were never multi-device aware and
// that's unchanged here.
function getReceiverSocketId(userId) {
  const sockets = userSocketMap[userId];
  if (!sockets || sockets.size === 0) return undefined;
  return sockets.values().next().value;
}

function getCallRoomId(groupId) {
  return `call:${groupId}`;
}

function getCallParticipants(groupId) {
  return activeCallParticipants.get(groupId);
}

// Snapshot used both when a call first starts and when we need to catch a
// freshly (re)connected socket up on a call that was already in progress —
// just enough for the "a call is live" banner, not the full roster.
function getActiveGroupCallInfo(groupId) {
  const participants = activeCallParticipants.get(groupId);
  if (!participants || participants.size === 0) return null;

  const [, firstParticipant] = participants.entries().next().value;
  return { groupId, callType: firstParticipant.callType };
}

// Lets every member of the group know a call is live — not just those
// already on it — so people who haven't joined yet see a "call is live"
// banner instead of only finding out by opening the chat and guessing.
function announceGroupCallStarted(groupId, callType, startedBy, { toSocket } = {}) {
  const payload = { groupId, callType, startedBy: startedBy || null };
  if (toSocket) {
    toSocket.emit("call:group-call-started", payload);
  } else {
    io.to(groupId).emit("call:group-call-started", payload);
  }
}

// Companion to announceGroupCallStarted — lets the whole group (not just
// the call room) know the call is over, so the banner disappears for
// anyone who saw it but never joined.
function announceGroupCallEnded(groupId) {
  io.to(groupId).emit("call:group-call-ended", { groupId });
}

// Catches a socket up on any calls already in progress for groups it
// belongs to — covers both a fresh login/connect and a reconnect, so the
// "call is live" banner isn't only shown to people who were already
// online when the call started.
async function notifyActiveGroupCalls(userId, socket) {
  try {
    const groups = await Group.find({ members: userId }).select("_id");
    groups.forEach((group) => {
      const info = getActiveGroupCallInfo(group._id.toString());
      if (info) {
        announceGroupCallStarted(info.groupId, info.callType, null, { toSocket: socket });
      }
    });
  } catch (error) {
    console.error("Error notifying active group calls:", error.message);
  }
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
  announceGroupCallEnded(groupId);
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
    announceGroupCallEnded(groupId);
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
    addUserSocket(userId, socket.id);
    joinUserToGroupRooms(userId, socket.id).then(() => {
      notifyActiveGroupCalls(userId, socket);
    });
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

  // 1:1 screen sharing. The video itself goes over the existing peer
  // connection via replaceTrack() (no renegotiation), so this is only a
  // small "the other person is presenting" flag the receiving UI uses to
  // switch layout — same idea as the group mute/camera state below.
  socket.on(
    "call:screen-share",
    ({ toUserId, sharing }) => {
      if (!userId || !toUserId) return;

      const targetSocketId =
        getReceiverSocketId(toUserId);

      if (targetSocketId) {
        io.to(targetSocketId).emit("call:screen-share", {
          fromUserId: userId.toString(),
          sharing: !!sharing,
        });
      }
    }
  );

  // ---------------- Typing indicators ----------------
  //
  // Purely ephemeral: nothing is stored, the event is just relayed. For a
  // DM it goes to every live socket of the other person (so a second tab
  // or device shows it too); for a group it goes to everyone else in the
  // group's room. The sender re-emits while they keep typing and the
  // client also expires stale entries, so a dropped "stop" is harmless.
  socket.on("typing", ({ toUserId, groupId, isTyping }) => {
    if (!userId) return;

    const payload = { fromUserId: userId.toString(), isTyping: !!isTyping };

    if (groupId) {
      const roomId = String(groupId);
      // Only sockets that are actually in the group's room can broadcast to it.
      if (!socket.rooms.has(roomId)) return;

      socket.to(roomId).emit("typing", { ...payload, groupId: roomId });
      return;
    }

    if (!toUserId || String(toUserId) === userId.toString()) return;

    userSocketMap[toUserId]?.forEach((targetSocketId) => {
      io.to(targetSocketId).emit("typing", payload);
    });
  });

  // ---------------- Group Call Signaling (mesh) ----------------
  //
  // Group calls layer on top of 1:1 signaling: call:offer/answer/
  // ice-candidate above are reused as-is (now carrying fromUserId) to
  // set up each pairwise RTCPeerConnection. These handlers only manage
  // *who's in the call room* — join, leave, and the 6-person cap —
  // separately from group chat membership.

  socket.on(
    "call:group-join",
    async ({ groupId, callType = "video", sharingScreen = false }, callback) => {
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
          .map(([id, info]) => ({
            userId: id,
            callType: info.callType,
            // Lets a late joiner (or someone reconnecting) know who is
            // already presenting, since they missed the original event.
            sharingScreen: !!info.sharingScreen,
          }));

        const isNewCall = participants.size === 0;

        participants.set(key, {
          socketId: socket.id,
          callType,
          sharingScreen: !!sharingScreen,
        });
        socket.join(getCallRoomId(groupId));

        callback?.({ participants: existingParticipants });

        // Let everyone already on the call know to expect an incoming
        // offer from the new joiner.
        socket.to(getCallRoomId(groupId)).emit("call:group-user-joined", {
          groupId,
          userId: key,
          callType,
          sharingScreen: !!sharingScreen,
        });

        // First person in — tell the rest of the group (not just the
        // call room) so members who haven't joined yet see a "call is
        // live" banner instead of only finding out by opening the chat.
        if (isNewCall) {
          announceGroupCallStarted(groupId, callType, key);
        }
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

  // Broadcasts that this user started/stopped presenting their screen.
  // The screen itself travels peer-to-peer over each pairwise connection
  // (replaceTrack, no renegotiation); this flag is what lets everyone
  // else promote them to the main stage. It's also remembered on the
  // participant record so anyone who joins mid-share gets it in their
  // join response instead of having to guess from the video.
  socket.on("call:group-screen-share", ({ groupId, sharing }) => {
    if (!groupId || !userId) return;

    const participant = getCallParticipants(groupId)?.get(userId.toString());

    // Only someone actually on this call (from this socket) can present.
    if (!participant || participant.socketId !== socket.id) return;

    participant.sharingScreen = !!sharing;

    socket.to(getCallRoomId(groupId)).emit("call:group-screen-share", {
      groupId,
      userId: userId.toString(),
      sharing: !!sharing,
    });
  });

  // Ends the call for every current participant (e.g. the last person
  // leaving, or a forced end), rather than tearing down one peer.
  socket.on("call:group-end", ({ groupId }) => endCallForGroup(groupId));

  // ---------------- Disconnect ----------------

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);

    if (userId) {
      removeUserSocket(userId, socket.id);

      // If this socket dropped mid-call, tell the rest of the mesh so
      // they tear down that one peer connection instead of hanging on
      // a dead connection until ICE eventually times out.
      activeCallParticipants.forEach((participants, groupId) => {
        if (participants.get(userId.toString())?.socketId === socket.id) {
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