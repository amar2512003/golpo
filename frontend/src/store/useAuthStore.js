import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import { io } from "socket.io-client";

const BASE_URL =
  import.meta.env.MODE === "development"
    ? "http://localhost:3000"
    : "/";

export const useAuthStore = create((set, get) => ({
  authUser: null,
  isCheckingAuth: true,
  onlineUsers: [],
  socket: null,

  checkAuth: async () => {
    set({ isCheckingAuth: true });

    try {
      const res = await axiosInstance.get("/auth/check");
      set({ authUser: res.data });

      get().connectSocket(res.data);
    } catch (error) {
      console.error("Error in checkAuth:", error);
      set({ authUser: null });
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  clearAuth: () => {
    set({
      authUser: null,
      isCheckingAuth: false,
      onlineUsers: [],
    });

    get().disconnectSocket();
  },

  connectSocket: (user) => {
    if (!user || get().socket?.connected) return;

    const socket = io(BASE_URL, {
      query: {
        userId: user._id,
      },
    });

    set({ socket });

    socket.on("getOnlineUsers", (userIds) => {
      set({
        onlineUsers: userIds,
      });
    });

    // ---------------- WebRTC Signaling Listeners ----------------

    socket.on("call:offer", (data) => {
      import("./useCallStore").then(({ useCallStore }) => {
        import("./useChatStore").then(({ useChatStore }) => {
          const { users, conversations } = useChatStore.getState();

          const caller =
            users.find((u) => u._id === data.fromUserId) ||
            conversations.find((u) => u._id === data.fromUserId);

          const callerInfo = caller
            ? {
                fullName: caller.fullName,
                profilePic: caller.profilePic,
              }
            : {
                fullName: "Unknown",
                profilePic: null,
              };

          useCallStore.getState().receiveOffer(data, callerInfo);
        });
      });
    });

    socket.on("call:answer", (data) => {
      import("./useCallStore").then(({ useCallStore }) => {
        useCallStore.getState().handleAnswer(data);
      });
    });

    socket.on("call:ice-candidate", (data) => {
      import("./useCallStore").then(({ useCallStore }) => {
        useCallStore.getState().handleIceCandidate(data);
      });
    });

    socket.on("call:end", () => {
      import("./useCallStore").then(({ useCallStore }) => {
        useCallStore.getState().resetCall();
      });
    });

    socket.on("call:reject", () => {
      import("./useCallStore").then(({ useCallStore }) => {
        useCallStore.getState().resetCall();
      });
    });

    // ---------------- End WebRTC Signaling ----------------
  },

  disconnectSocket: () => {
    const socket = get().socket;

    if (socket?.connected) {
      socket.disconnect();
    }

    set({
      socket: null,
    });
  },
}));