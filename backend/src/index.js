import express from "express";
import cors from "cors";

import "dotenv/config";

import fs from "fs";
import path from "path";

import { clerkMiddleware } from "@clerk/express";

import User from "./models/user.model.js";
import { connectDB } from "./lib/db.js";
import job from "./lib/cron.js";

import clerkWebhook from "./webhooks/clerk.webhook.js";
import authRoutes from "./routes/auth.route.js";
import messageRoutes from "./routes/message.route.js";
import { app, server } from "./lib/socket.js";

const PORT = process.env.PORT;
const FRONTEND_URL = process.env.FRONTEND_URL;

const publicDir = path.join(process.cwd(), "public");

// it's important that you don't parse the webhook event data, it should be in the raw format
app.use("/api/webhooks/clerk", express.raw({ type: "application/json" }), clerkWebhook);

app.use(express.json());
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(clerkMiddleware());

// TEMP DEBUG LOGGING - remove after diagnosing socket.io routing
app.use((req, res, next) => {
  console.log("[REQ]", req.method, req.path);
  next();
});

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);

// if the public directory exists, serve the static files
// this is for the production build
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));

  app.get("/{*any}", (req, res, next) => {
    // don't let the SPA fallback swallow socket.io or API requests
    if (req.path.startsWith("/socket.io") || req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.join(publicDir, "index.html"), (err) => next(err));
  });
}

server.listen(PORT, () => {
  connectDB();
  console.log("Server is up and running on PORT:", PORT);

  if (process.env.NODE_ENV === "production") job.start();
});