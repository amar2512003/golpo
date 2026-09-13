import { create } from "zustand";
import toast from "react-hot-toast";

import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";

// Kept in sync with backend MAX_GROUP_MEMBERS (models/group.model.js).
export const MAX_GROUP_MEMBERS = 6;

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
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load messages");
    } finally {
      set({ isGroupMessagesLoading: false });
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

  // Live messages for whichever group is currently open. Own messages are
  // skipped here since sendGroupMessage already appended them locally —
  // this mirrors useChatStore.subscribeToMessages' senderId filter.
  subscribeToGroupMessages: (groupId) => {
    if (!groupId) return;

    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.off("newGroupMessage");
    socket.on("newGroupMessage", (newMessage) => {
      const authUser = useAuthStore.getState().authUser;
      const senderId = newMessage.senderId?._id || newMessage.senderId;

      if (String(senderId) === String(authUser?._id)) return;
      if (String(newMessage.groupId) !== String(get().activeGroupId)) return;

      set({ groupMessages: [...get().groupMessages, newMessage] });
    });
  },

  unsubscribeFromGroupMessages: () => {
    const socket = useAuthStore.getState().socket;
    socket?.off("newGroupMessage");
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
      set((state) => ({
        groups: state.groups.map((existing) => (existing._id === group._id ? group : existing)),
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
