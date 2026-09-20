import { create } from "zustand";
import { useAuthStore } from "./useAuthStore";

// If we never hear "stopped typing" (tab closed, connection dropped), the
// indicator disappears on its own after this long. The sender re-emits
// every few seconds while they're still typing, which keeps it alive.
const TYPING_EXPIRY_MS = 5000;

// `${chatKey}|${userId}` -> timeout id for that person's expiry.
const expiryTimers = new Map();

// A chat is keyed by the other person (DM) or by the group, so the same
// user typing in a DM and in a group are tracked separately.
export const getDmTypingKey = (userId) => `dm:${userId}`;
export const getGroupTypingKey = (groupId) => `group:${groupId}`;

export const useTypingStore = create((set, get) => ({
  // chatKey -> array of userIds currently typing there.
  typing: {},

  setTyping: (chatKey, userId, isTyping) => {
    const timerKey = `${chatKey}|${userId}`;

    clearTimeout(expiryTimers.get(timerKey));
    expiryTimers.delete(timerKey);

    if (isTyping) {
      expiryTimers.set(
        timerKey,
        setTimeout(() => get().setTyping(chatKey, userId, false), TYPING_EXPIRY_MS),
      );
    }

    set((state) => {
      const current = state.typing[chatKey] ?? [];
      const alreadyTyping = current.includes(userId);

      // Refreshing an existing entry only needs the timer reset above.
      if (isTyping === alreadyTyping) return state;

      const next = isTyping
        ? [...current, userId]
        : current.filter((id) => id !== userId);

      const typing = { ...state.typing };
      if (next.length > 0) typing[chatKey] = next;
      else delete typing[chatKey];

      return { typing };
    });
  },

  // Used when a real message arrives — whoever sent it has clearly stopped
  // typing, and this avoids the dots lingering next to their new message.
  clearTyping: (chatKey, userId) => get().setTyping(chatKey, String(userId), false),

  subscribeToTyping: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.off("typing");
    socket.on("typing", ({ fromUserId, groupId, isTyping }) => {
      if (!fromUserId) return;

      const chatKey = groupId ? getGroupTypingKey(groupId) : getDmTypingKey(fromUserId);
      get().setTyping(chatKey, String(fromUserId), !!isTyping);
    });
  },

  unsubscribeFromTyping: () => {
    useAuthStore.getState().socket?.off("typing");

    expiryTimers.forEach((timer) => clearTimeout(timer));
    expiryTimers.clear();
    set({ typing: {} });
  },
}));
