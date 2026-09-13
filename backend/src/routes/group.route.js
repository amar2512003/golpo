import express from "express";
import {
  addMembers,
  createGroup,
  deleteGroup,
  getGroupInvitePreview,
  getGroupMessages,
  getUserGroups,
  joinGroupByInvite,
  leaveGroup,
  makeAdmin,
  regenerateInviteCode,
  removeMember,
  sendGroupMessage,
  updateGroup,
} from "../controllers/group.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/upload.middleware.js";

const router = express.Router();

router.use(protectRoute);

router.post("/", createGroup);
router.get("/", getUserGroups);

// Invite-link routes. Order doesn't matter against the /:groupId routes
// below (different path shapes), but keeping them together for clarity.
router.get("/invite/:inviteCode", getGroupInvitePreview);
router.post("/invite/:inviteCode/join", joinGroupByInvite);

router.get("/:groupId/messages", getGroupMessages);
router.post("/:groupId/messages", upload.single("media"), sendGroupMessage);
router.patch("/:groupId", upload.single("groupPic"), updateGroup);
router.delete("/:groupId", deleteGroup);
router.patch("/:groupId/admin", makeAdmin);
router.post("/:groupId/members", addMembers);
router.post("/:groupId/invite/regenerate", regenerateInviteCode);
router.delete("/:groupId/members/:memberId", removeMember);
router.post("/:groupId/leave", leaveGroup);

export default router;
