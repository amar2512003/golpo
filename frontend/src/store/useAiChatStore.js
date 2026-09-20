import { create } from "zustand";
import { persist } from "zustand/middleware";
import toast from "react-hot-toast";

import { axiosInstance } from "../lib/axios";

let idCounter = 0;
const nextId = () => `ai-${Date.now()}-${idCounter++}`;

const WELCOME_MESSAGE_ID = "ai-welcome";

function createWelcomeMessage() {
  return {
    id: WELCOME_MESSAGE_ID,
    role: "assistant",
    content: "Hi! I'm your AI assistant. Ask me anything.",
    createdAt: new Date().toISOString(),
  };
}

// A pinned, always-available "conversation" that lives entirely on this
// device (messages persist to localStorage, not MongoDB) and talks to the
// backend's /api/ai/chat route, which relays to Groq. Kept as its own
// store — mirroring how useGroupStore sits alongside useChatStore — so the
// DM/group code doesn't need to know AI chat exists beyond a couple of
// small hooks that close it when a real conversation is opened.
export const useAiChatStore = create(
  persist(
    (set, get) => ({
      isActive: false,
      messages: [createWelcomeMessage()],
      isTyping: false,

      openAiChat: () => {
        set({ isActive: true });
        // Opening the AI thread closes whichever DM or group was open,
        // the same way selecting a DM closes an open group and vice versa.
        import("./useChatStore").then(({ useChatStore }) => {
          useChatStore.getState().setActiveConversationId(null);
        });
        import("./useGroupStore").then(({ useGroupStore }) => {
          useGroupStore.getState().clearActiveGroup();
        });
      },

      closeAiChat: () => set({ isActive: false }),

      clearAiChat: () => set({ messages: [createWelcomeMessage()] }),

      sendAiMessage: async (text) => {
        const trimmed = (text ?? "").trim();
        if (!trimmed) return false;

        const userMessage = {
          id: nextId(),
          role: "user",
          content: trimmed,
          createdAt: new Date().toISOString(),
        };

        set({ messages: [...get().messages, userMessage], isTyping: true });

        try {
          // The welcome message is local flavor text, not something the
          // model said, so it's left out of the history sent to Groq.
          const history = get()
            .messages.filter((message) => message.id !== WELCOME_MESSAGE_ID)
            .map((message) => ({ role: message.role, content: message.content }));

          const res = await axiosInstance.post("/ai/chat", { messages: history });

          const replyMessage = {
            id: nextId(),
            role: "assistant",
            content: res.data?.message?.content || "Sorry, I don't have a reply for that.",
            createdAt: new Date().toISOString(),
          };

          set({ messages: [...get().messages, replyMessage] });
          return true;
        } catch (error) {
          toast.error(error.response?.data?.message || "The AI assistant couldn't respond");
          return false;
        } finally {
          set({ isTyping: false });
        }
      },
    }),
    {
      name: "golpo-ai-chat",
      partialize: (state) => ({ messages: state.messages }),
    },
  ),
);
