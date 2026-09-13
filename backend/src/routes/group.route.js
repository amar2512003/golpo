import express from "express";
import {
  addMembers,
  createGroup,
  getGroupMessages,
  getUserGroups,
  leaveGroup,
  removeMember,
  sendGroupMessage,
} from "../controllers/group.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/upload.middleware.js";

const router = express.Router();

router.use(protectRoute);

router.post("/", createGroup);
router.get("/", getUserGroups);
router.get("/:groupId/messages", getGroupMessages);
router.post("/:groupId/messages", upload.single("media"), sendGroupMessage);
router.post("/:groupId/members", addMembers);
router.delete("/:groupId/members/:memberId", removeMember);
router.post("/:groupId/leave", leaveGroup);

export default router;
