import express from "express";
import {
  getConversationsForSidebar,
  getMessages,
  getUserById,
  markMessagesSeen,
  searchUserByEmail,
  sendMessage,
  voteOnPoll,
} from "../controllers/message.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/upload.middleware.js";

const router = express.Router();

router.use(protectRoute);

// Order matters: "search" is a literal path, so it has to be registered
// before the "/:id" param route below or it'd be swallowed as an id.
router.get("/users/search", searchUserByEmail);
router.get("/users/:id", getUserById);
router.get("/conversations", getConversationsForSidebar);
router.get("/:id", getMessages);
router.put("/seen/:id", markMessagesSeen);
router.post("/send/:id", upload.single("media"), sendMessage);
router.put("/:id/poll/vote", voteOnPoll);

export default router;