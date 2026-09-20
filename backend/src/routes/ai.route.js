import express from "express";
import { sendAiMessage } from "../controllers/ai.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// Requires login like every other feature — an unauthenticated visitor
// shouldn't be able to burn through the app's Groq quota.
router.use(protectRoute);

router.post("/chat", sendAiMessage);

export default router;
