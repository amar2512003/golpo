import { create } from "zustand";
import { persist } from "zustand/middleware";

import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import { getDmTypingKey, useTypingStore } from "./useTypingStore";
import toast from "react-hot-toast";

// Kept outside the store (it's a singleton module) purely so each
// unsubscribe can remove the exact listener it added — via socket.off(event,
// handler) — without disturbing the other "newMessage" listener. Plain
// socket.off("newMessage") would remove *every* listener for that event,
// which would wipe out whichever of these two got subscribed first.
let conversationUpdateHandler = null;
let activeDmMessageHandler = null;
let activeDmSeenHandler = null;
let activeDmPollHandler = null;

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
          toast.error(error.response?.data?.message || "Couldn't load your conversations");
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
          // it — clear any seen backlog from this sender, and optimistically
          // zero out its unread badge in the sidebar right away rather than
          // waiting on the next getConversations() refresh.
          get().markMessagesSeen(userId);
          set((state) => ({
            conversations: state.conversations.map((conversation) =>
              conversation._id === userId ? { ...conversation, unreadCount: 0 } : conversation,
            ),
          }));
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

        if (activeDmMessageHandler) socket.off("newMessage", activeDmMessageHandler);
        activeDmMessageHandler = (newMessage) => {
          // A message arriving means its sender is done typing.
          useTypingStore
            .getState()
            .clearTyping(getDmTypingKey(newMessage.senderId), newMessage.senderId);

          // if im not the receiver don't do anything just return
          if (String(newMessage.senderId) !== String(userId)) return;

          set({ messages: [...get().messages, newMessage] });

          get().getConversations();
          // The conversation is open right now, so this counts as seen
          // immediately rather than waiting for the next getMessages call.
          get().markMessagesSeen(userId);
        };
        socket.on("newMessage", activeDmMessageHandler);

        if (activeDmSeenHandler) socket.off("messagesSeen", activeDmSeenHandler);
        activeDmSeenHandler = ({ seenBy }) => {
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
        };
        socket.on("messagesSeen", activeDmSeenHandler);

        // A poll the other person voted on — swap in the updated
        // document wherever it currently sits in the open thread.
        if (activeDmPollHandler) socket.off("messagePollUpdated", activeDmPollHandler);
        activeDmPollHandler = (updatedMessage) => {
          set({
            messages: get().messages.map((message) =>
              String(message._id) === String(updatedMessage._id) ? updatedMessage : message,
            ),
          });
        };
        socket.on("messagePollUpdated", activeDmPollHandler);
      },

      unsubscribeFromMessages: () => {
        const socket = useAuthStore.getState().socket;
        if (socket && activeDmMessageHandler) socket.off("newMessage", activeDmMessageHandler);
        if (socket && activeDmSeenHandler) socket.off("messagesSeen", activeDmSeenHandler);
        if (socket && activeDmPollHandler) socket.off("messagePollUpdated", activeDmPollHandler);
        activeDmMessageHandler = null;
        activeDmSeenHandler = null;
        activeDmPollHandler = null;
      },

      // Session-wide (not tied to whichever DM happens to be open) so the
      // sidebar's last-message preview and unread badge stay live for
      // every conversation, not just the active one. subscribeToMessages
      // above still owns appending to the open thread; this only owns
      // keeping the conversations list itself fresh. Uses a named handler
      // (rather than socket.off("newMessage")) so it doesn't get wiped out
      // every time subscribeToMessages rebinds its own listener when the
      // active conversation changes.
      subscribeToConversationUpdates: () => {
        const socket = useAuthStore.getState().socket;
        if (!socket) return;

        if (conversationUpdateHandler) {
          socket.off("newMessage", conversationUpdateHandler);
        }
        conversationUpdateHandler = () => get().getConversations();
        socket.on("newMessage", conversationUpdateHandler);
      },

      unsubscribeFromConversationUpdates: () => {
        const socket = useAuthStore.getState().socket;
        if (socket && conversationUpdateHandler) {
          socket.off("newMessage", conversationUpdateHandler);
        }
        conversationUpdateHandler = null;
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

      // Voice notes are uploaded like other media; `duration` (seconds, from
      // the recorder) rides along because webm files don't carry it reliably.
      sendVoiceMessage: async ({ conversationId, file, duration }) => {
        if (!conversationId || !file) return false;

        const formData = new FormData();
        formData.append("audioDuration", String(duration ?? ""));
        formData.append("media", file);

        set({ isSendingMedia: true });
        try {
          return await get().sendMessage(formData);
        } finally {
          set({ isSendingMedia: false });
        }
      },

      // Stickers send instantly as their own text message (no composer
      // text involved) so picking one doesn't clobber whatever's already
      // typed.
      sendStickerMessage: async (conversationId, sticker) => {
        if (!conversationId || !sticker) return false;
        return get().sendMessage({ text: sticker });
      },

      // GIFs are already-hosted images (from the GIF picker), so they go
      // straight through as an imageUrl — no file upload needed.
      sendGifMessage: async (conversationId, gifUrl) => {
        if (!conversationId || !gifUrl) return false;
        return get().sendMessage({ imageUrl: gifUrl });
      },

      // Shares the sender's current position: an OpenStreetMap static
      // preview image (no API key needed) alongside a Google Maps link
      // for the receiver to open. Rides the normal text+imageUrl message
      // shape — no schema change needed.
      sendLocationMessage: async (conversationId) => {
        if (!conversationId) return false;
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
        const previewUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${latitude},${longitude}&zoom=15&size=480x260&maptype=mapnik&markers=${latitude},${longitude},red-pushpin`;
        const mapsLink = `https://www.google.com/maps?q=${latitude},${longitude}`;

        return get().sendMessage({ imageUrl: previewUrl, text: `📍 My location: ${mapsLink}` });
      },

      // Polls go through as { poll } JSON — the backend validates and
      // starts every option at zero votes.
      sendPollMessage: async (conversationId, { question, options }) => {
        if (!conversationId || !question?.trim()) return false;
        const cleanOptions = (options || []).map((option) => option.trim()).filter(Boolean);
        if (cleanOptions.length < 2) return false;

        return get().sendMessage({ poll: { question: question.trim(), options: cleanOptions } });
      },

      // Single-choice: picking the option you already voted for retracts
      // it (handled server-side); the response is the source of truth.
      voteOnPoll: async (messageId, optionIndex) => {
        if (!messageId) return false;
        try {
          const res = await axiosInstance.put(`/messages/${messageId}/poll/vote`, { optionIndex });
          set({
            messages: get().messages.map((message) =>
              message._id === messageId ? res.data : message,
            ),
          });
          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || "Couldn't cast your vote");
          return false;
        }
      },
    }),
    {
      name: "imessage-storage",
      partialize: (state) => ({ isSoundEnabled: state.isSoundEnabled }),
    },
  ),
);