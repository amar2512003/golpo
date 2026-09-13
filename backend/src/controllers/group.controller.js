import Group, { MAX_GROUP_MEMBERS } from "../models/group.model.js";
import GroupMessage from "../models/groupMessage.model.js";
import { hasImageKitConfig, uploadChatMedia } from "../lib/imagekit.js";
import { io, joinUserToGroupRooms, endCallForGroup, removeUserFromGroupCall } from "../lib/socket.js";

function isMember(group, userId) {
  return group.members.some((memberId) => memberId.toString() === userId.toString());
}

function isAdmin(group, userId) {
  return group.admin.toString() === userId.toString();
}

export async function createGroup(req, res) {
  try {
    const { name, memberIds = [] } = req.body;
    const adminId = req.user._id;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Group name is required" });
    }

    // Dedupe and always include the creator.
    const uniqueMemberIds = Array.from(
      new Set([adminId.toString(), ...memberIds.map(String)]),
    );

    if (uniqueMemberIds.length < 2) {
      return res.status(400).json({ message: "Add at least one other member" });
    }

    if (uniqueMemberIds.length > MAX_GROUP_MEMBERS) {
      return res.status(400).json({
        message: `Groups are limited to ${MAX_GROUP_MEMBERS} members`,
      });
    }

    const group = await Group.create({
      name: name.trim(),
      admin: adminId,
      createdBy: adminId,
      members: uniqueMemberIds,
    });

    const populatedGroup = await group.populate("members admin createdBy", "-clerkId");

    // Bring every currently-online member into the room immediately,
    // so they don't need to reconnect to start receiving group messages.
    // This has to be awaited: joinUserToGroupRooms does an async DB
    // lookup, and if the "groupCreated" emit below fired before it
    // resolved, members whose sockets hadn't joined the room yet would
    // simply miss the event (Socket.IO doesn't queue/replay it).
    await Promise.all(uniqueMemberIds.map((memberId) => joinUserToGroupRooms(memberId)));

    io.to(group._id.toString()).emit("groupCreated", populatedGroup);

    res.status(201).json(populatedGroup);
  } catch (error) {
    console.error("Error in createGroup:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getUserGroups(req, res) {
  try {
    const userId = req.user._id;

    const groups = await Group.find({ members: userId })
      .populate("members admin createdBy", "-clerkId")
      .sort({ updatedAt: -1 });

    res.status(200).json(groups);
  } catch (error) {
    console.error("Error in getUserGroups:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getGroupMessages(req, res) {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (!isMember(group, userId)) {
      return res.status(403).json({ message: "Not a member of this group" });
    }

    const messages = await GroupMessage.find({ groupId })
      .populate("senderId", "-clerkId")
      .sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    console.error("Error in getGroupMessages:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function sendGroupMessage(req, res) {
  try {
    const { groupId } = req.params;
    const { text } = req.body;
    const senderId = req.user._id;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (!isMember(group, senderId)) {
      return res.status(403).json({ message: "Not a member of this group" });
    }

    let imageUrl;
    let videoUrl;

    if (req.file) {
      if (!hasImageKitConfig()) {
        return res.status(500).json({ message: "Media upload is not configured" });
      }

      const url = await uploadChatMedia(req.file);
      if (req.file.mimetype.startsWith("video/")) videoUrl = url;
      else imageUrl = url;
    }

    const newMessage = await GroupMessage.create({
      groupId,
      senderId,
      text,
      image: imageUrl,
      video: videoUrl,
    });

    const populatedMessage = await newMessage.populate("senderId", "-clerkId");

    io.to(groupId).emit("newGroupMessage", populatedMessage);

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error("Error in sendGroupMessage:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function addMembers(req, res) {
  try {
    const { groupId } = req.params;
    const { memberIds = [] } = req.body;
    const requesterId = req.user._id;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (group.admin.toString() !== requesterId.toString()) {
      return res.status(403).json({ message: "Only the group admin can add members" });
    }

    const updatedMembers = Array.from(
      new Set([...group.members.map(String), ...memberIds.map(String)]),
    );

    if (updatedMembers.length > MAX_GROUP_MEMBERS) {
      return res.status(400).json({
        message: `Groups are limited to ${MAX_GROUP_MEMBERS} members`,
      });
    }

    group.members = updatedMembers;
    await group.save();

    const populatedGroup = await group.populate("members admin createdBy", "-clerkId");

    // Same ordering issue as createGroup: the newly-added member's
    // socket must actually join the room before we emit, or they'll
    // never see the group until they reconnect/refresh.
    await Promise.all(updatedMembers.map((memberId) => joinUserToGroupRooms(memberId)));

    io.to(groupId).emit("groupUpdated", populatedGroup);

    res.status(200).json(populatedGroup);
  } catch (error) {
    console.error("Error in addMembers:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function removeMember(req, res) {
  try {
    const { groupId, memberId } = req.params;
    const requesterId = req.user._id;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (group.admin.toString() !== requesterId.toString()) {
      return res.status(403).json({ message: "Only the group admin can remove members" });
    }

    if (memberId === requesterId.toString()) {
      return res.status(400).json({ message: "Admin can't remove themselves — use leave instead" });
    }

    group.members = group.members.filter((id) => id.toString() !== memberId);
    await group.save();

    removeUserFromGroupCall(groupId, memberId);

    const populatedGroup = await group.populate("members admin createdBy", "-clerkId");

    io.to(groupId).emit("groupUpdated", populatedGroup);
    io.to(groupId).emit("removedFromGroup", { groupId, memberId });

    res.status(200).json(populatedGroup);
  } catch (error) {
    console.error("Error in removeMember:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Renames the group, edits its description, and/or swaps its picture.
// Any subset of these can be sent at once — only the fields actually
// present in the request are touched.
export async function updateGroup(req, res) {
  try {
    const { groupId } = req.params;
    const { name, description } = req.body;
    const requesterId = req.user._id;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (!isAdmin(group, requesterId)) {
      return res.status(403).json({ message: "Only the group admin can edit this group" });
    }

    if (typeof name === "string") {
      if (!name.trim()) {
        return res.status(400).json({ message: "Group name is required" });
      }
      group.name = name.trim();
    }

    if (typeof description === "string") {
      const trimmedDescription = description.trim();
      if (trimmedDescription.length > 500) {
        return res.status(400).json({ message: "Description must be 500 characters or fewer" });
      }
      group.description = trimmedDescription;
    }

    if (req.file) {
      if (!hasImageKitConfig()) {
        return res.status(500).json({ message: "Image upload is not configured" });
      }
      group.groupPic = await uploadChatMedia(req.file);
    }

    await group.save();

    const populatedGroup = await group.populate("members admin createdBy", "-clerkId");

    io.to(groupId).emit("groupUpdated", populatedGroup);

    res.status(200).json(populatedGroup);
  } catch (error) {
    console.error("Error in updateGroup:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Hands admin rights to another current member. Only the current admin
// can do this — there's no group-vote mechanic, just a direct handoff.
export async function makeAdmin(req, res) {
  try {
    const { groupId } = req.params;
    const { memberId } = req.body;
    const requesterId = req.user._id;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (!isAdmin(group, requesterId)) {
      return res.status(403).json({ message: "Only the group admin can transfer admin" });
    }

    if (!memberId) {
      return res.status(400).json({ message: "memberId is required" });
    }

    if (memberId === requesterId.toString()) {
      return res.status(400).json({ message: "You're already the admin" });
    }

    if (!isMember(group, memberId)) {
      return res.status(400).json({ message: "That user isn't a member of this group" });
    }

    group.admin = memberId;
    await group.save();

    const populatedGroup = await group.populate("members admin createdBy", "-clerkId");

    io.to(groupId).emit("groupUpdated", populatedGroup);

    res.status(200).json(populatedGroup);
  } catch (error) {
    console.error("Error in makeAdmin:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Permanently deletes the group, its message history, and ends any call
// currently in progress for it (there's no group left for anyone to be
// on a call "for" once this completes).
export async function deleteGroup(req, res) {
  try {
    const { groupId } = req.params;
    const requesterId = req.user._id;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (!isAdmin(group, requesterId)) {
      return res.status(403).json({ message: "Only the group admin can delete this group" });
    }

    endCallForGroup(groupId);

    await GroupMessage.deleteMany({ groupId });
    await group.deleteOne();

    io.to(groupId).emit("groupDeleted", { groupId });

    res.status(200).json({ message: "Group deleted" });
  } catch (error) {
    console.error("Error in deleteGroup:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function leaveGroup(req, res) {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    group.members = group.members.filter((id) => id.toString() !== userId.toString());

    // If the admin leaves, hand off to the next remaining member.
    if (group.admin.toString() === userId.toString() && group.members.length > 0) {
      group.admin = group.members[0];
    }

    removeUserFromGroupCall(groupId, userId);

    if (group.members.length === 0) {
      endCallForGroup(groupId);
      await GroupMessage.deleteMany({ groupId });
      await group.deleteOne();
      io.to(groupId).emit("groupDeleted", { groupId });
      return res.status(200).json({ message: "Group deleted (last member left)" });
    }

    await group.save();

    const populatedGroup = await group.populate("members admin createdBy", "-clerkId");

    io.to(groupId).emit("groupUpdated", populatedGroup);
    io.to(groupId).emit("memberLeft", { groupId, memberId: userId });

    res.status(200).json(populatedGroup);
  } catch (error) {
    console.error("Error in leaveGroup:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}
