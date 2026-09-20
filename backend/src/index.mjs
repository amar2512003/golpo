import express from "express";
import cors from "cors";
import "dotenv/config";
import fs from "fs";
import path from "path";

import { clerkMiddleware } from "@clerk/express";

import { connectDB } from "./lib/db.js";
import { syncStatusIndexes } from "./models/status.model.js";
import job, { statusCleanupJob } from "./lib/cron.js";
import { cleanupExpiredStatusesFully } from "./lib/statusCleanup.js";

import clerkWebhook from "./webhooks/clerk.webhook.js";
import authRoutes from "./routes/auth.route.js";
import messageRoutes from "./routes/message.route.js";
import groupRoutes from "./routes/group.route.js";
import statusRoutes from "./routes/status.route.js";
import aiRoutes from "./routes/ai.route.js";

import { app, server } from "./lib/socket.js";

const PORT = process.env.PORT || 3000;

const FRONTEND_URL =
  process.env.FRONTEND_URL || "http://localhost:5173";

const publicDir = path.join(process.cwd(), "public");

// --------------------------------------------------
// MongoDB connection
// --------------------------------------------------

let dbConnected = false;

async function ensureDBConnection() {
  if (dbConnected) {
    return;
  }

  await connectDB();

  dbConnected = true;

  console.log("MongoDB connected");

  // The Status model has autoIndex off, so its indexes are built here
  // instead — once per cold start, and never in a way that can fail a
  // request (syncStatusIndexes swallows its own errors).
  await syncStatusIndexes();
}

// --------------------------------------------------
// Basic middleware
// --------------------------------------------------

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

app.use(clerkMiddleware());

// --------------------------------------------------
// Debug logging
// --------------------------------------------------

app.use((req, res, next) => {
  console.log("[REQ]", req.method, req.path);
  next();
});

// --------------------------------------------------
// Health check
// --------------------------------------------------

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
  });
});

// --------------------------------------------------
// Clerk webhook
// IMPORTANT: webhook needs raw body
// --------------------------------------------------

app.use(
  "/api/webhooks/clerk",
  express.raw({
    type: "application/json",
  }),
  async (req, res, next) => {
    try {
      await ensureDBConnection();
      next();
    } catch (error) {
      console.error(
        "MongoDB connection failed:",
        error
      );

      return res.status(500).json({
        error: "Database connection failed",
      });
    }
  },
  clerkWebhook
);

// --------------------------------------------------
// JSON body parser
// --------------------------------------------------

app.use(express.json());

// --------------------------------------------------
// API routes
// --------------------------------------------------

if (process.env.VERCEL) {
  // Make sure MongoDB is connected before API requests
  app.use(
    "/api/auth",
    async (req, res, next) => {
      try {
        await ensureDBConnection();
        next();
      } catch (error) {
        console.error(
          "MongoDB connection failed:",
          error
        );

        return res.status(500).json({
          error: "Database connection failed",
        });
      }
    },
    authRoutes
  );

  app.use(
    "/api/messages",
    async (req, res, next) => {
      try {
        await ensureDBConnection();
        next();
      } catch (error) {
        console.error(
          "MongoDB connection failed:",
          error
        );

        return res.status(500).json({
          error: "Database connection failed",
        });
      }
    },
    messageRoutes
  );

  app.use(
    "/api/groups",
    async (req, res, next) => {
      try {
        await ensureDBConnection();
        next();
      } catch (error) {
        console.error(
          "MongoDB connection failed:",
          error
        );

        return res.status(500).json({
          error: "Database connection failed",
        });
      }
    },
    groupRoutes
  );

  app.use(
    "/api/status",
    async (req, res, next) => {
      try {
        await ensureDBConnection();
        next();
      } catch (error) {
        console.error(
          "MongoDB connection failed:",
          error
        );

        return res.status(500).json({
          error: "Database connection failed",
        });
      }
    },
    statusRoutes
  );

  app.use(
    "/api/ai",
    async (req, res, next) => {
      try {
        await ensureDBConnection();
        next();
      } catch (error) {
        console.error(
          "MongoDB connection failed:",
          error
        );

        return res.status(500).json({
          error: "Database connection failed",
        });
      }
    },
    aiRoutes
  );
} else {
  // Render / Local
  app.use("/api/auth", authRoutes);
  app.use("/api/messages", messageRoutes);
  app.use("/api/groups", groupRoutes);
  app.use("/api/status", statusRoutes);
  app.use("/api/ai", aiRoutes);
}

// --------------------------------------------------
// Production static files
// --------------------------------------------------

if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));

  app.get("/{*any}", (req, res, next) => {
    if (
      req.path.startsWith("/socket.io") ||
      req.path.startsWith("/api")
    ) {
      return next();
    }

    res.sendFile(
      path.join(publicDir, "index.html"),
      (err) => next(err)
    );
  });
}

// --------------------------------------------------
// Local / Render
// --------------------------------------------------

if (!process.env.VERCEL) {
  server.listen(PORT, async () => {
    try {
      await connectDB();

      console.log(
        "Server is up and running on PORT:",
        PORT
      );

      if (process.env.NODE_ENV === "production") {
        job.start();
      }

      // Expired statuses leave images behind in ImageKit, so this sweep
      // runs in every environment. One pass at boot clears whatever
      // expired while the server was down, then every 10 minutes after.
      await syncStatusIndexes();

      statusCleanupJob.start();
      cleanupExpiredStatusesFully().catch((error) =>
        console.error("Initial status cleanup failed:", error.message),
      );
    } catch (error) {
      console.error(
        "Database connection failed:",
        error
      );
    }
  });
}

// --------------------------------------------------
// Vercel export
// --------------------------------------------------

export default server;