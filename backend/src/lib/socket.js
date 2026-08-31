import express from "express";
import http from "http";
import { Server } from "socket.io";

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

function getReceiverSocketId(userId) {
  return userSocketMap[userId];
}

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  const userId = socket.handshake.query.userId;

  if (userId) {
    userSocketMap[userId] = socket.id;
  }

  io.emit(
    "getOnlineUsers",
    Object.keys(userSocketMap)
  );

  // ---------------- WebRTC Signaling ----------------

  socket.on(
    "call:offer",
    ({ toUserId, fromUserId, offer, callType }) => {
      const targetSocketId =
        getReceiverSocketId(toUserId);

      if (targetSocketId) {
        io.to(targetSocketId).emit("call:offer", {
          fromUserId,
          offer,
          callType,
        });
      }
    }
  );

  socket.on(
    "call:answer",
    ({ toUserId, answer }) => {
      const targetSocketId =
        getReceiverSocketId(toUserId);

      if (targetSocketId) {
        io.to(targetSocketId).emit(
          "call:answer",
          {
            answer,
          }
        );
      }
    }
  );

  socket.on(
    "call:ice-candidate",
    ({ toUserId, candidate }) => {
      const targetSocketId =
        getReceiverSocketId(toUserId);

      if (targetSocketId) {
        io.to(targetSocketId).emit(
          "call:ice-candidate",
          {
            candidate,
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

  // ---------------- Disconnect ----------------

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);

    if (userId) {
      delete userSocketMap[userId];
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
};