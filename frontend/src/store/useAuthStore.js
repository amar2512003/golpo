import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import { io } from "socket.io-client";

const BASE_URL =
  import.meta.env.MODE === "development"
    ? "http://localhost:3000"
    : window.location.origin;

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
      path: "/socket.io",

      transports: ["websocket", "polling"],

      withCredentials: true,

      query: {
        userId: user._id,
      },
    });

    set({ socket });

    // ---------------- Socket Events ----------------

    // "connect" fires both for the very first connection and for every
    // automatic reconnect socket.io does after a network drop. We only
    // want to react to the latter — a real reconnect means any active
    // group call's peer connections were negotiated over a signaling
    // session that's now gone and need to be rebuilt.
    let hasConnectedBefore = false;

    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);

      if (hasConnectedBefore) {
        import("./useGroupCallStore").then(({ useGroupCallStore }) => {
          useGroupCallStore.getState().handleSocketReconnect();
        });
      }
      hasConnectedBefore = true;
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
    });

    socket.on("getOnlineUsers", (userIds) => {
      set({
        onlineUsers: userIds,
      });
    });

    // ---------------- WebRTC Signaling ----------------

    // Receive call offer
    socket.on("call:offer", (data) => {
      if (data.groupId) {
        import("./useGroupCallStore").then(({ useGroupCallStore }) => {
          useGroupCallStore.getState().handleOffer(data);
        });
        return;
      }

      import("./useCallStore").then(({ useCallStore }) => {
        import("./useChatStore").then(({ useChatStore }) => {
          const { users, conversations } =
            useChatStore.getState();

          const caller =
            users.find(
              (u) => u._id === data.fromUserId
            ) ||
            conversations.find(
              (u) => u._id === data.fromUserId
            );

          const callerInfo = caller
            ? {
                fullName: caller.fullName,
                profilePic: caller.profilePic,
              }
            : {
                fullName: "Unknown",
                profilePic: null,
              };

          useCallStore
            .getState()
            .receiveOffer(data, callerInfo);
        });
      });
    });

    // Receive call answer
    socket.on("call:answer", (data) => {
      if (data.groupId) {
        import("./useGroupCallStore").then(({ useGroupCallStore }) => {
          useGroupCallStore.getState().handleAnswer(data);
        });
        return;
      }

      import("./useCallStore").then(({ useCallStore }) => {
        useCallStore
          .getState()
          .handleAnswer(data);
      });
    });

    // Receive ICE candidate
    socket.on("call:ice-candidate", (data) => {
      if (data.groupId) {
        import("./useGroupCallStore").then(({ useGroupCallStore }) => {
          useGroupCallStore.getState().handleIceCandidate(data);
        });
        return;
      }

      import("./useCallStore").then(({ useCallStore }) => {
        useCallStore
          .getState()
          .handleIceCandidate(data);
      });
    });

    // Call ended
    socket.on("call:end", () => {
      import("./useCallStore").then(({ useCallStore }) => {
        useCallStore
          .getState()
          .resetCall();
      });
    });

    // Call rejected
    socket.on("call:reject", () => {
      import("./useCallStore").then(({ useCallStore }) => {
        useCallStore
          .getState()
          .resetCall();
      });
    });

    // ---------------- Group Call Signaling (mesh) ----------------

    socket.on("call:group-user-joined", (data) => {
      import("./useGroupCallStore").then(({ useGroupCallStore }) => {
        useGroupCallStore.getState().handleUserJoined(data);
      });
    });

    socket.on("call:group-user-left", (data) => {
      import("./useGroupCallStore").then(({ useGroupCallStore }) => {
        useGroupCallStore.getState().handleUserLeft(data);
      });
    });

    socket.on("call:group-ended", () => {
      import("./useGroupCallStore").then(({ useGroupCallStore }) => {
        useGroupCallStore.getState().handleCallEnded();
      });
    });

    socket.on("call:group-media-state", (data) => {
      import("./useGroupCallStore").then(({ useGroupCallStore }) => {
        useGroupCallStore.getState().handleRemoteMediaState(data);
      });
    });

    // ---------------- End WebRTC Signaling ----------------
  },

  disconnectSocket: () => {
    const socket = get().socket;

    if (socket) {
      socket.disconnect();
    }

    import("./useGroupCallStore").then(({ useGroupCallStore }) => {
      if (useGroupCallStore.getState().status !== "idle") {
        useGroupCallStore.getState()._teardown();
      }
    });

    set({
      socket: null,
      onlineUsers: [],
    });
  },
}));