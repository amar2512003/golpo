import { create } from "zustand";
import toast from "react-hot-toast";

import { axiosInstance } from "../lib/axios";
import { buildLocationMessageText } from "../lib/location";
import { useAuthStore } from "./useAuthStore";
import { getGroupTypingKey, useTypingStore } from "./useTypingStore";

// Kept in sync with backend MAX_GROUP_MEMBERS (models/group.model.js).
export const MAX_GROUP_MEMBERS = 6;

// Kept outside the store (it's a singleton module) so each unsubscribe can
// remove the exact listener it added via socket.off(event, handler) —
// plain socket.off("newGroupMessage") would remove *both* of these.
let activeGroupMessageHandler = null;
let groupConversationUpdateHandler = null;
let activeGroupPollHandler = null;

// If we're on a call for a group we just lost access to (removed, left
// elsewhere, or the group was deleted), there's no one left we're
// allowed to be connected to — leave the call instead of lingering in it.
function forceLeaveGroupCall(groupId) {
  import("./useGroupCallStore").then(({ useGroupCallStore }) => {
    useGroupCallStore.getState().forceLeaveForGroup(groupId);
  });
}

function removeGroupLocally(state, groupId) {
  const activeGroupCalls = { ...state.activeGroupCalls };
  delete activeGroupCalls[groupId];

  return {
    groups: state.groups.filter((group) => group._id !== groupId),
    activeGroupId: state.activeGroupId === groupId ? null : state.activeGroupId,
    groupMessages: state.activeGroupId === groupId ? [] : state.groupMessages,
    activeGroupCalls,
  };
}

export const useGroupStore = create((set, get) => ({
  groups: [],
  activeGroupId: null,
  groupMessages: [],
  isGroupsLoading: false,
  isGroupMessagesLoading: false,
  isSendingGroupMedia: false,
  isUpdatingGroup: false,

  // groupId -> { callType, startedByUserId }. Populated from
  // call:group-call-started / call:group-call-ended, which the server
  // broadcasts to every group member (not just people on the call), so
  // members who haven't joined yet know a call is live and can jump in.
  activeGroupCalls: {},

  getGroups: async () => {
    set({ isGroupsLoading: true });
    try {
      const res = await axiosInstance.get("/groups");
      set({ groups: res.data });
    } catch (error) {
      console.log("Error in getGroups", error.message);
    } finally {
      set({ isGroupsLoading: false });
    }
  },

  getGroupMessages: async (groupId) => {
    if (!groupId) return;
    set({ isGroupMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/groups/${groupId}/messages`);
      set({ groupMessages: res.data });
      // Opening the group is as good as reading everything in it.
      // Zero the badge locally right away rather than waiting on a round
      // trip, then tell the backend (fire-and-forget, like DMs) so it
      // stays correct on the next getGroups() refresh too.
      set((state) => ({
        groups: state.groups.map((group) =>
          group._id === groupId ? { ...group, unreadCount: 0 } : group,
        ),
      }));
      get().markGroupMessagesSeen(groupId);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load messages");
    } finally {
      set({ isGroupMessagesLoading: false });
    }
  },

  // Fire-and-forget, mirroring useChatStore's markMessagesSeen — a
  // failure here just means the unread badge catches up next time the
  // group list refreshes.
  markGroupMessagesSeen: async (groupId) => {
    if (!groupId) return;
    try {
      await axiosInstance.put(`/groups/${groupId}/seen`);
    } catch (error) {
      console.log("Error in markGroupMessagesSeen", error.message);
    }
  },

  // Brief preview for the invite-link landing page — doesn't require
  // being a member, so this is safe to call before anyone's actually
  // joined. Returns null (rather than throwing) on an invalid/expired
  // code so the page can show its own "link isn't valid" state.
  getGroupInvitePreview: async (inviteCode) => {
    try {
      const res = await axiosInstance.get(`/groups/invite/${inviteCode}`);
      return res.data;
    } catch (error) {
      return { error: error.response?.data?.message || "This invite link is no longer valid" };
    }
  },

  // Joins (or, for someone already a member, just re-fetches) the group
  // behind an invite code. Unlike _applyGroupUpdate, this adds the group
  // to local state if it wasn't there yet — mirrors how createGroup
  // seeds state for a brand-new group.
  joinGroupByInviteCode: async (inviteCode) => {
    try {
      const res = await axiosInstance.post(`/groups/invite/${inviteCode}/join`);
      set((state) => ({
        groups: state.groups.some((group) => group._id === res.data._id)
          ? state.groups.map((group) => (group._id === res.data._id ? res.data : group))
          : [res.data, ...state.groups],
      }));
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.message || "Couldn't join that group");
      return null;
    }
  },

  regenerateInviteCode: async (groupId) => {
    try {
      const res = await axiosInstance.post(`/groups/${groupId}/invite/regenerate`);
      set((state) => ({
        groups: state.groups.map((group) =>
          group._id === groupId ? { ...group, inviteCode: res.data.inviteCode } : group,
        ),
      }));
      return res.data.inviteCode;
    } catch (error) {
      toast.error(error.response?.data?.message || "Couldn't reset the invite link");
      return null;
    }
  },

  createGroup: async ({ name, memberIds }) => {
    try {
      const res = await axiosInstance.post("/groups", { name, memberIds });
      set((state) => ({
        groups: state.groups.some((group) => group._id === res.data._id)
          ? state.groups
          : [res.data, ...state.groups],
      }));
      get().setActiveGroupId(res.data._id);
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to create group");
      return null;
    }
  },

  // Applies a server-returned group doc to local state — every group
  // management action below (rename, admin transfer, membership changes)
  // ends the same way, so they all funnel through this.
  _applyGroupUpdate: (updatedGroup) => {
    set((state) => ({
      groups: state.groups.map((group) =>
        group._id === updatedGroup._id ? updatedGroup : group,
      ),
    }));
  },

  // name/description/groupPicFile are all optional — only the ones
  // provided are changed. Admin-only on the backend.
  updateGroupDetails: async (groupId, { name, description, groupPicFile } = {}) => {
    set({ isUpdatingGroup: true });
    try {
      const formData = new FormData();
      if (typeof name === "string") formData.append("name", name);
      if (typeof description === "string") formData.append("description", description);
      if (groupPicFile) formData.append("groupPic", groupPicFile);

      const res = await axiosInstance.patch(`/groups/${groupId}`, formData);
      get()._applyGroupUpdate(res.data);
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update group");
      return null;
    } finally {
      set({ isUpdatingGroup: false });
    }
  },

  makeAdmin: async (groupId, memberId) => {
    try {
      const res = await axiosInstance.patch(`/groups/${groupId}/admin`, { memberId });
      get()._applyGroupUpdate(res.data);
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to change admin");
      return null;
    }
  },

  addGroupMembers: async (groupId, memberIds) => {
    try {
      const res = await axiosInstance.post(`/groups/${groupId}/members`, { memberIds });
      get()._applyGroupUpdate(res.data);
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to add members");
      return null;
    }
  },

  removeGroupMember: async (groupId, memberId) => {
    try {
      const res = await axiosInstance.delete(`/groups/${groupId}/members/${memberId}`);
      get()._applyGroupUpdate(res.data);
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to remove member");
      return false;
    }
  },

  // Leaving/deleting the group also means leaving any call currently
  // running for it — there's nothing left for this user to be on a call
  // "for" once they're not a member (or it doesn't exist) any more.
  leaveGroupById: async (groupId) => {
    try {
      await axiosInstance.post(`/groups/${groupId}/leave`);
      set((state) => removeGroupLocally(state, groupId));
      forceLeaveGroupCall(groupId);
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to leave group");
      return false;
    }
  },

  deleteGroupById: async (groupId) => {
    try {
      await axiosInstance.delete(`/groups/${groupId}`);
      set((state) => removeGroupLocally(state, groupId));
      forceLeaveGroupCall(groupId);
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete group");
      return false;
    }
  },

  sendGroupMessage: async (messageData) => {
    const { activeGroupId, groupMessages } = get();
    if (!activeGroupId) return false;

    try {
      const res = await axiosInstance.post(`/groups/${activeGroupId}/messages`, messageData);
      set({ groupMessages: [...groupMessages, res.data] });
      get().getGroups();
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to send message");
      return false;
    }
  },

  sendGroupTextMessage: async (groupId, text) => {
    const messageText = (text ?? "").trim();
    if (!groupId || !messageText) return false;

    return get().sendGroupMessage({ text: messageText });
  },

  sendGroupMediaMessage: async ({ groupId, file }) => {
    if (!groupId || !file) return false;

    const formData = new FormData();
    formData.append("media", file);

    set({ isSendingGroupMedia: true });
    try {
      return await get().sendGroupMessage(formData);
    } finally {
      set({ isSendingGroupMedia: false });
    }
  },

  // Voice notes are uploaded like other media; `duration` (seconds, from the
  // recorder) rides along because webm files don't carry it reliably.
  sendGroupVoiceMessage: async ({ groupId, file, duration }) => {
    if (!groupId || !file) return false;

    const formData = new FormData();
    formData.append("audioDuration", String(duration ?? ""));
    formData.append("media", file);

    set({ isSendingGroupMedia: true });
    try {
      return await get().sendGroupMessage(formData);
    } finally {
      set({ isSendingGroupMedia: false });
    }
  },

  // Stickers send instantly as their own text message (no composer text
  // involved) so picking one doesn't clobber whatever's already typed.
  // Stickers are already-hosted images (from the sticker picker); `isSticker`
  // tells the bubble to render it borderless/oversized instead of as a
  // chat image.
  sendGroupStickerMessage: async (groupId, stickerUrl) => {
    if (!groupId || !stickerUrl) return false;
    return get().sendGroupMessage({ imageUrl: stickerUrl, isSticker: true });
  },

  // GIFs are already-hosted images (from the GIF picker), so they go
  // straight through as an imageUrl — no file upload needed.
  sendGroupGifMessage: async (groupId, gifUrl) => {
    if (!groupId || !gifUrl) return false;
    return get().sendGroupMessage({ imageUrl: gifUrl });
  },

  // Shares the sender's current position as a plain text message
  // carrying a Google Maps link. The chat bubble recognises that shape
  // and draws it as a map card (see LocationCard), so no image is
  // uploaded or attached and no schema change is needed.
  sendGroupLocationMessage: async (groupId) => {
    if (!groupId) return false;
    if (!navigator.geolocation) {
      toast.error("Location isn't available on this device");
      return false;
    }

    const position = await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });

    if (!position) {
      toast.error("Couldn't get your location");
      return false;
    }

    const { latitude, longitude } = position.coords;

    return get().sendGroupMessage({ text: buildLocationMessageText(latitude, longitude) });
  },

  // Polls go through as { poll } JSON — the backend validates and starts
  // every option at zero votes.
  sendGroupPollMessage: async (groupId, { question, options }) => {
    if (!groupId || !question?.trim()) return false;
    const cleanOptions = (options || []).map((option) => option.trim()).filter(Boolean);
    if (cleanOptions.length < 2) return false;

    return get().sendGroupMessage({ poll: { question: question.trim(), options: cleanOptions } });
  },

  // Single-choice: picking the option you already voted for retracts it
  // (handled server-side); the response is the source of truth.
  voteOnGroupPoll: async (messageId, optionIndex) => {
    if (!messageId) return false;
    try {
      const res = await axiosInstance.put(`/groups/messages/${messageId}/poll/vote`, {
        optionIndex,
      });
      set({
        groupMessages: get().groupMessages.map((message) =>
          message._id === messageId ? res.data : message,
        ),
      });
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || "Couldn't cast your vote");
      return false;
    }
  },

  // Live messages for whichever group is currently open. Own messages are
  // skipped here since sendGroupMessage already appended them locally —
  // this mirrors useChatStore.subscribeToMessages' senderId filter.
  subscribeToGroupMessages: (groupId) => {
    if (!groupId) return;

    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    if (activeGroupMessageHandler) socket.off("newGroupMessage", activeGroupMessageHandler);
    activeGroupMessageHandler = (newMessage) => {
      const authUser = useAuthStore.getState().authUser;
      const senderId = newMessage.senderId?._id || newMessage.senderId;

      // A message arriving means its sender is done typing.
      useTypingStore
        .getState()
        .clearTyping(getGroupTypingKey(newMessage.groupId), senderId);

      if (String(senderId) === String(authUser?._id)) return;
      if (String(newMessage.groupId) !== String(get().activeGroupId)) return;

      set({
        groupMessages: [...get().groupMessages, newMessage],
        groups: get().groups.map((group) =>
          String(group._id) === String(newMessage.groupId)
            ? { ...group, lastMessageAt: newMessage.createdAt }
            : group,
        ),
      });

      // This group's thread is open right now, so the message just
      // rendered counts as read immediately rather than waiting for the
      // next time the group list is opened.
      get().markGroupMessagesSeen(newMessage.groupId);
    };
    socket.on("newGroupMessage", activeGroupMessageHandler);

    // A poll in this group someone voted on — swap in the updated
    // document wherever it currently sits in the open thread.
    if (activeGroupPollHandler) socket.off("groupMessagePollUpdated", activeGroupPollHandler);
    activeGroupPollHandler = (updatedMessage) => {
      if (String(updatedMessage.groupId) !== String(get().activeGroupId)) return;
      set({
        groupMessages: get().groupMessages.map((message) =>
          String(message._id) === String(updatedMessage._id) ? updatedMessage : message,
        ),
      });
    };
    socket.on("groupMessagePollUpdated", activeGroupPollHandler);
  },

  unsubscribeFromGroupMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (socket && activeGroupMessageHandler) socket.off("newGroupMessage", activeGroupMessageHandler);
    if (socket && activeGroupPollHandler) socket.off("groupMessagePollUpdated", activeGroupPollHandler);
    activeGroupMessageHandler = null;
    activeGroupPollHandler = null;
  },

  // Session-wide (not tied to whichever group happens to be open) so the
  // sidebar's last-message preview and unread badge stay live for every
  // group, not just the active one.
  subscribeToGroupConversationUpdates: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    if (groupConversationUpdateHandler) {
      socket.off("newGroupMessage", groupConversationUpdateHandler);
    }
    groupConversationUpdateHandler = () => get().getGroups();
    socket.on("newGroupMessage", groupConversationUpdateHandler);
  },

  unsubscribeFromGroupConversationUpdates: () => {
    const socket = useAuthStore.getState().socket;
    if (socket && groupConversationUpdateHandler) {
      socket.off("newGroupMessage", groupConversationUpdateHandler);
    }
    groupConversationUpdateHandler = null;
  },

  // Membership/roster events — these apply regardless of which thread is
  // open, so this subscribes once per session (see ChatPage) rather than
  // per active group.
  subscribeToGroupEvents: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.off("groupCreated");
    socket.off("groupUpdated");
    socket.off("groupDeleted");
    socket.off("removedFromGroup");
    socket.off("memberLeft");
    socket.off("call:group-call-started");
    socket.off("call:group-call-ended");

    socket.on("groupCreated", (group) => {
      set((state) =>
        state.groups.some((existing) => existing._id === group._id)
          ? state
          : { groups: [group, ...state.groups] },
      );
    });

    socket.on("groupUpdated", (group) => {
      // groupUpdated only carries the group's own fields (name, members,
      // etc.) — the last-message preview and unread count are computed
      // separately by getUserGroups, so carry those over rather than
      // letting this overwrite them with undefined.
      set((state) => ({
        groups: state.groups.map((existing) =>
          existing._id === group._id
            ? {
                ...group,
                lastMessageAt: existing.lastMessageAt,
                lastMessage: existing.lastMessage,
                unreadCount: existing.unreadCount,
              }
            : existing,
        ),
      }));
    });

    socket.on("groupDeleted", ({ groupId }) => {
      set((state) => removeGroupLocally(state, groupId));
      forceLeaveGroupCall(groupId);
    });

    socket.on("removedFromGroup", ({ groupId, memberId }) => {
      const authUserId = useAuthStore.getState().authUser?._id;
      if (String(memberId) !== String(authUserId)) return; // someone else was removed
      set((state) => removeGroupLocally(state, groupId));
      forceLeaveGroupCall(groupId);
    });

    socket.on("memberLeft", ({ groupId, memberId }) => {
      const authUserId = useAuthStore.getState().authUser?._id;
      if (String(memberId) !== String(authUserId)) return; // someone else left
      set((state) => removeGroupLocally(state, groupId));
      forceLeaveGroupCall(groupId);
    });

    // Someone started (or we just discovered) a group call. The server
    // already excludes the person who started it from this event, so no
    // need to special-case "was it me" here.
    socket.on("call:group-call-started", ({ groupId, callType, startedBy }) => {
      set((state) => ({
        activeGroupCalls: { ...state.activeGroupCalls, [groupId]: { callType, startedByUserId: startedBy } },
      }));

      // Only nudge with a toast if this isn't the thread already open —
      // the banner inside the chat covers that case.
      if (String(get().activeGroupId) !== String(groupId)) {
        const group = get().groups.find((g) => g._id === groupId);
        const label = callType === "audio" ? "Audio call" : "Video call";
        toast(`${label} started in ${group?.name || "a group"}`);
      }
    });

    socket.on("call:group-call-ended", ({ groupId }) => {
      set((state) => {
        if (!(groupId in state.activeGroupCalls)) return state;
        const activeGroupCalls = { ...state.activeGroupCalls };
        delete activeGroupCalls[groupId];
        return { activeGroupCalls };
      });
    });
  },

  unsubscribeFromGroupEvents: () => {
    const socket = useAuthStore.getState().socket;
    socket?.off("groupCreated");
    socket?.off("groupUpdated");
    socket?.off("groupDeleted");
    socket?.off("removedFromGroup");
    socket?.off("memberLeft");
    socket?.off("call:group-call-started");
    socket?.off("call:group-call-ended");
  },

  setActiveGroupId: (groupId) => {
    if (groupId) {
      import("./useChatStore").then(({ useChatStore }) => {
        useChatStore.getState().setActiveConversationId(null);
      });
    }
    set({ activeGroupId: groupId, groupMessages: [] });
  },

  clearActiveGroup: () => set({ activeGroupId: null, groupMessages: [] }),
}));
