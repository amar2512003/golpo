import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

const allowedOrigin = process.env.FRONTEND_URL || "http://localhost:5173";

const io = new Server(server, { cors: { origin: [allowedOrigin] } });

function getReceiverSocketId(userId) {
  return userSocketMap[userId];
}

// online users map = { userId: socketId }
const userSocketMap = {};

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;

  if (userId) userSocketMap[userId] = socket.id;

  // io.emit() sends event to everyone - broadcast
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // ---------------- WebRTC Signaling ----------------

  // Send offer
  socket.on("call:offer", ({ toUserId, fromUserId, offer, callType }) => {
    const targetSocketId = getReceiverSocketId(toUserId);

    if (targetSocketId) {
      io.to(targetSocketId).emit("call:offer", {
        fromUserId,
        offer,
        callType,
      });
    }
  });

  // Send answer
  socket.on("call:answer", ({ toUserId, answer }) => {
    const targetSocketId = getReceiverSocketId(toUserId);

    if (targetSocketId) {
      io.to(targetSocketId).emit("call:answer", {
        answer,
      });
    }
  });

  // Exchange ICE candidates
  socket.on("call:ice-candidate", ({ toUserId, candidate }) => {
    const targetSocketId = getReceiverSocketId(toUserId);

    if (targetSocketId) {
      io.to(targetSocketId).emit("call:ice-candidate", {
        candidate,
      });
    }
  });

  // End call
  socket.on("call:end", ({ toUserId }) => {
    const targetSocketId = getReceiverSocketId(toUserId);

    if (targetSocketId) {
      io.to(targetSocketId).emit("call:end");
    }
  });

  // Reject call
  socket.on("call:reject", ({ toUserId }) => {
    const targetSocketId = getReceiverSocketId(toUserId);

    if (targetSocketId) {
      io.to(targetSocketId).emit("call:reject");
    }
  });

  // ---------------- End WebRTC Signaling ----------------

  // socket.on is used to listen for events
  socket.on("disconnect", () => {
    if (userId) delete userSocketMap[userId];
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

export { app, server, io, getReceiverSocketId };