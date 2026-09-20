import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import { io } from "socket.io-client";

const BASE_URL =
  import.meta.env.MODE === "development"
    ? "http://localhost:3000"
    : window.location.origin;

// Waits (ms) between /auth/check retries — see checkAuth below.
const AUTH_RETRY_DELAYS_MS = [400, 1000, 2000];

export const useAuthStore = create((set, get) => ({
  authUser: null,
  isCheckingAuth: true,
  onlineUsers: [],
  socket: null,

  // The very first /auth/check after a page load can fail even though the
  // user really is signed in: Clerk's session cookie may still be a stale
  // (short-lived) one at that instant, or the backend may be cold-starting.
  // If that single call is treated as final, `authUser` stays null for the
  // whole session — and every "is this message mine?" check downstream
  // (chat bubble side, "You:" previews, group ownership) silently fails.
  // So: ask Clerk for a fresh token first, and retry a few times.
  checkAuth: async () => {
    set({ isCheckingAuth: true });

    let lastError = null;

    for (let attempt = 0; attempt <= AUTH_RETRY_DELAYS_MS.length; attempt++) {
      try {
        // Makes Clerk (re)write a fresh __session cookie before we call the API.
        await window.Clerk?.session?.getToken().catch(() => {});

        const res = await axiosInstance.get("/auth/check");
        if (!res.data?._id) throw new Error("Auth check returned no user");

        set({ authUser: res.data, isCheckingAuth: false });
        get().connectSocket(res.data);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < AUTH_RETRY_DELAYS_MS.length) {
          await new Promise((resolve) => setTimeout(resolve, AUTH_RETRY_DELAYS_MS[attempt]));
        }
      }
    }

    console.error("Error in checkAuth:", lastError);
    // Keep an already-loaded user if a background re-check fails.
    set((state) => ({ authUser: state.authUser ?? null, isCheckingAuth: false }));
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

    // The other person in a 1:1 call started/stopped sharing their screen
    socket.on("call:screen-share", (data) => {
      import("./useCallStore").then(({ useCallStore }) => {
        useCallStore.getState().handleRemoteScreenShare(data);
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

    // Someone in the group call started/stopped presenting their screen
    socket.on("call:group-screen-share", (data) => {
      import("./useGroupCallStore").then(({ useGroupCallStore }) => {
        useGroupCallStore.getState().handleRemoteScreenShare(data);
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