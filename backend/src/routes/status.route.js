import express from "express";
import {
  createStatus,
  deleteStatus,
  getStatusFeed,
  markStatusSeen,
  runStatusCleanup,
} from "../controllers/status.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/upload.middleware.js";

const router = express.Router();

// Registered before protectRoute because it isn't a user-facing route:
// it's the cleanup sweep, for platforms where nothing long-lived is
// running to hold a cron (Vercel, say — point a scheduled job at
// POST /api/status/cleanup). It authenticates with CRON_SECRET instead
// of a session. On a normal server the in-process cron already covers
// this and the endpoint can be ignored.
// GET as well as POST because most hosted schedulers (Vercel Cron among
// them) can only issue GETs.
router.get("/cleanup", runStatusCleanup);
router.post("/cleanup", runStatusCleanup);

router.use(protectRoute);

router.get("/", getStatusFeed);
router.post("/", upload.single("media"), createStatus);
router.put("/:id/seen", markStatusSeen);
router.delete("/:id", deleteStatus);

export default router;
