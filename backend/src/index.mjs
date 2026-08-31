import express from "express";
import cors from "cors";
import "dotenv/config";
import fs from "fs";
import path from "path";

import { clerkMiddleware } from "@clerk/express";

import { connectDB } from "./lib/db.js";
import job from "./lib/cron.js";

import clerkWebhook from "./webhooks/clerk.webhook.js";
import authRoutes from "./routes/auth.route.js";
import messageRoutes from "./routes/message.route.js";

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
} else {
  // Render / Local
  app.use("/api/auth", authRoutes);
  app.use("/api/messages", messageRoutes);
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