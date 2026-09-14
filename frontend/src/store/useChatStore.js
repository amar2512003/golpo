import { create } from "zustand";
import { persist } from "zustand/middleware";

import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import toast from "react-hot-toast";

export const useChatStore = create(
  persist(
    (set, get) => ({
      // Cache of users we're actually allowed to know about: anyone found
      // via an exact email search, or resolved from an invite link. There
      // is deliberately no "browse everyone" list any more — see
      // searchUserByEmail.
      users: [],
      conversations: [],
      messages: [],
      selectedUser: null,
      isConversationsLoading: false,
      isMessagesLoading: false,
      activeConversationId: null,
      searchQuery: "",
      sidebarTab: "chats",
      composerText: "",
      isSoundEnabled: true,
      isSendingMedia: false,

      // Email search state for the Users tab.
      userSearchQuery: "",
      isSearchingUser: false,
      userSearchResult: null,
      userSearchError: "",

      // Adds/updates one user in the local cache — used whenever we learn
      // a profile via search or an invite link, so lookups elsewhere
      // (selected conversation, composer, etc.) can find them by id.
      _cacheUser: (user) => {
        if (!user?._id) return;
        set((state) => ({
          users: state.users.some((existing) => existing._id === user._id)
            ? state.users.map((existing) => (existing._id === user._id ? user : existing))
            : [...state.users, user],
        }));
      },

      setUserSearchQuery: (userSearchQuery) => set({ userSearchQuery }),

      clearUserSearch: () =>
        set({ userSearchQuery: "", userSearchResult: null, userSearchError: "", isSearchingUser: false }),

      // Exact, case-insensitive email lookup — the only way to find
      // someone you're not already talking to. Deliberately doesn't
      // accept partial matches so it can't be used to enumerate users.
      searchUserByEmail: async (email) => {
        const trimmedEmail = (email ?? "").trim();
        if (!trimmedEmail) return null;

        set({ isSearchingUser: true, userSearchResult: null, userSearchError: "" });
        try {
          const res = await axiosInstance.get("/messages/users/search", {
            params: { email: trimmedEmail },
          });
          get()._cacheUser(res.data);
          set({ userSearchResult: res.data, userSearchError: "" });
          return res.data;
        } catch (error) {
          const message =
            error.response?.status === 404
              ? "No user found with that email"
              : error.response?.data?.message || "Couldn't search for that user";
          set({ userSearchResult: null, userSearchError: message });
          return null;
        } finally {
          set({ isSearchingUser: false });
        }
      },

      // Resolves an invite link (`/invite/:userId`) into a profile we can
      // start chatting with, caching it the same way a search result is.
      getUserById: async (userId) => {
        if (!userId) return null;
        try {
          const res = await axiosInstance.get(`/messages/users/${userId}`);
          get()._cacheUser(res.data);
          return res.data;
        } catch (error) {
          toast.error(error.response?.data?.message || "Couldn't open that invite link");
          return null;
        }
      },

      getConversations: async () => {
        set({ isConversationsLoading: true });
        try {
          const res = await axiosInstance.get("/messages/conversations");
          set({ conversations: res.data });
        } catch (error) {
          console.log("Error in getConversations", error.message);
        } finally {
          set({ isConversationsLoading: false });
        }
      },

      getMessages: async (userId) => {
        if (!userId) return;
        set({ isMessagesLoading: true });
        try {
          const res = await axiosInstance.get(`/messages/${userId}`);
          set({ messages: res.data });
          // Opening the conversation is as good as reading everything in
          // it — clear any seen backlog from this sender.
          get().markMessagesSeen(userId);
        } catch (error) {
          toast.error(error.response?.data?.message || "Failed to load messages");
        } finally {
          set({ isMessagesLoading: false });
        }
      },

      // Tells the backend I've read everything `userId` has sent me, and
      // (via socket, server-side) lets their client flip their sent
      // ticks from grey to blue. Fire-and-forget — a failure here just
      // means ticks catch up next time the conversation is reopened.
      markMessagesSeen: async (userId) => {
        if (!userId) return;
        try {
          await axiosInstance.put(`/messages/seen/${userId}`);
        } catch (error) {
          console.log("Error in markMessagesSeen", error.message);
        }
      },

      sendMessage: async (messageData) => {
        const { selectedUser, messages } = get();
        if (!selectedUser) return false;

        try {
          const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, messageData);
          set({ messages: [...messages, res.data], composerText: "" });
          get().getConversations();
          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || "Failed to send message");
          return false;
        }
      },

      subscribeToMessages: (userId) => {
        if (!userId) return;

        const socket = useAuthStore.getState().socket;
        if (!socket) return;

        socket.off("newMessage");
        socket.on("newMessage", (newMessage) => {
          // if im not the receiver don't do anything just return
          if (String(newMessage.senderId) !== String(userId)) return;

          set({ messages: [...get().messages, newMessage] });

          get().getConversations();
          // The conversation is open right now, so this counts as seen
          // immediately rather than waiting for the next getMessages call.
          get().markMessagesSeen(userId);
        });

        socket.off("messagesSeen");
        socket.on("messagesSeen", ({ seenBy }) => {
          // Only relevant if seenBy is the person whose conversation is
          // currently loaded — everything in `messages` right now was
          // sent to or received from them.
          if (String(seenBy) !== String(userId)) return;

          set({
            messages: get().messages.map((message) =>
              String(message.receiverId) === String(seenBy)
                ? { ...message, seen: true }
                : message,
            ),
          });
        });
      },

      unsubscribeFromMessages: () => {
        const socket = useAuthStore.getState().socket;
        socket?.off("newMessage");
        socket?.off("messagesSeen");
      },

      setSelectedUser: (selectedUser) => set({ selectedUser }),

      setActiveConversationId: (activeConversationId) => {
        // Opening a DM means any open group thread should close — the two
        // stores stay in sync via dynamic import (mirrors the pattern
        // useAuthStore already uses to talk to useCallStore).
        if (activeConversationId) {
          import("./useGroupStore").then(({ useGroupStore }) => {
            useGroupStore.getState().clearActiveGroup();
          });
        }

        set((state) => ({
          activeConversationId,
          selectedUser:
            state.users.find((user) => user._id === activeConversationId) ||
            state.conversations.find((user) => user._id === activeConversationId) ||
            null,
          messages: activeConversationId ? state.messages : [],
        }));
      },

      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setSidebarTab: (sidebarTab) => set({ sidebarTab }),
      setComposerText: (composerText) => set({ composerText }),
      setSoundEnabled: (isSoundEnabled) => set({ isSoundEnabled }),

      sendTextMessage: async (conversationId) => {
        const messageText = get().composerText.trim();
        if (!conversationId || !messageText) return false;

        return get().sendMessage({ text: messageText });
      },

      sendMediaMessage: async ({ conversationId, file }) => {
        if (!conversationId || !file) return false;

        const formData = new FormData();
        formData.append("media", file);

        set({ isSendingMedia: true });
        try {
          return await get().sendMessage(formData);
        } finally {
          set({ isSendingMedia: false });
        }
      },
    }),
    {
      name: "imessage-storage",
      partialize: (state) => ({ isSoundEnabled: state.isSoundEnabled }),
    },
  ),
);