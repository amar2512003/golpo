import { create } from "zustand";
import toast from "react-hot-toast";

import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";

// Statuses expire 24h after they're posted, and the backend refuses to
// serve one past that point even if Mongo's TTL sweep hasn't run yet. The
// client mirrors that rule locally so a tray left open overnight doesn't
// keep showing stories that are already gone.
export function isStatusLive(status) {
  return status?.expiresAt ? new Date(status.expiresAt).getTime() > Date.now() : true;
}

function pruneBucket(bucket) {
  if (!bucket) return null;
  const statuses = bucket.statuses.filter(isStatusLive);
  if (statuses.length === 0) return null;
  return { ...bucket, statuses, hasUnseen: statuses.some((status) => !status.seenByMe) };
}

// Same named-handler dance the chat store uses: keeping the listeners in
// module scope lets each unsubscribe remove exactly the handler it added,
// instead of socket.off(event) nuking every listener for that event.
let statusNewHandler = null;
let statusSeenHandler = null;
let statusDeletedHandler = null;

export const useStatusStore = create((set, get) => ({
  // My own statuses (so I can review who watched them and take them
  // down early), kept separate from the contacts' tray.
  mine: null,
  others: [],
  isStatusLoading: false,
  isPostingStatus: false,

  // Which person's story reel is open, and where we are in it. Stored as
  // an id rather than the bucket itself so a background refresh can swap
  // fresher data in underneath the open viewer.
  viewerUserId: null,
  viewerIndex: 0,

  getStatuses: async () => {
    set({ isStatusLoading: true });
    try {
      const res = await axiosInstance.get("/status");
      set({
        mine: pruneBucket(res.data.mine),
        others: (res.data.others || []).map(pruneBucket).filter(Boolean),
      });
    } catch (error) {
      console.log("Error loading statuses:", error.message);
    } finally {
      set({ isStatusLoading: false });
    }
  },

  postStatus: async ({ file, caption }) => {
    if (!file) return false;

    const formData = new FormData();
    formData.append("media", file);
    if (caption?.trim()) formData.append("caption", caption.trim());

    set({ isPostingStatus: true });
    try {
      await axiosInstance.post("/status", formData);
      await get().getStatuses();
      toast.success("Status posted — it'll disappear in 24 hours");
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || "Couldn't post your status");
      return false;
    } finally {
      set({ isPostingStatus: false });
    }
  },

  deleteStatus: async (statusId) => {
    if (!statusId) return false;
    try {
      await axiosInstance.delete(`/status/${statusId}`);
      await get().getStatuses();
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || "Couldn't delete that status");
      return false;
    }
  },

  // Flips the ring off locally the moment a status is opened, then tells
  // the server. Fire-and-forget: if the call fails the ring just comes
  // back on the next feed refresh, which is the honest outcome anyway.
  markStatusSeen: async (statusId) => {
    if (!statusId) return;

    const alreadySeen = get().others.some((bucket) =>
      bucket.statuses.some((status) => status._id === statusId && status.seenByMe),
    );
    if (alreadySeen) return;

    set((state) => ({
      others: state.others.map((bucket) => {
        if (!bucket.statuses.some((status) => status._id === statusId)) return bucket;
        const statuses = bucket.statuses.map((status) =>
          status._id === statusId ? { ...status, seenByMe: true } : status,
        );
        return { ...bucket, statuses, hasUnseen: statuses.some((status) => !status.seenByMe) };
      }),
    }));

    try {
      await axiosInstance.put(`/status/${statusId}/seen`);
    } catch (error) {
      console.log("Error marking status seen:", error.message);
    }
  },

  // ---------------- Viewer ----------------

  openStatusViewer: (userId, index = 0) => {
    if (!userId) return;
    set({ viewerUserId: userId, viewerIndex: index });
  },

  closeStatusViewer: () => set({ viewerUserId: null, viewerIndex: 0 }),

  setViewerIndex: (viewerIndex) => set({ viewerIndex }),

  // Steps forward through the open reel and rolls on to the next person
  // who still has unseen statuses, the way a story tray does. Returns
  // false once there's nothing left, which closes the viewer.
  advanceStatusViewer: () => {
    const { viewerUserId, viewerIndex, mine, others } = get();
    if (!viewerUserId) return false;

    const isMine = mine && mine.userId === viewerUserId;
    const bucket = isMine ? mine : others.find((entry) => entry.userId === viewerUserId);

    if (bucket && viewerIndex + 1 < bucket.statuses.length) {
      set({ viewerIndex: viewerIndex + 1 });
      return true;
    }

    // My own reel doesn't roll on into other people's.
    if (isMine) {
      set({ viewerUserId: null, viewerIndex: 0 });
      return false;
    }

    const currentPosition = others.findIndex((entry) => entry.userId === viewerUserId);
    const next = others[currentPosition + 1];

    if (next) {
      set({ viewerUserId: next.userId, viewerIndex: 0 });
      return true;
    }

    set({ viewerUserId: null, viewerIndex: 0 });
    return false;
  },

  // Mirror image of advance — steps back, and into the tail of the
  // previous person's reel once we're at the start of this one.
  rewindStatusViewer: () => {
    const { viewerUserId, viewerIndex, mine, others } = get();
    if (!viewerUserId) return;

    if (viewerIndex > 0) {
      set({ viewerIndex: viewerIndex - 1 });
      return;
    }

    if (mine && mine.userId === viewerUserId) return;

    const currentPosition = others.findIndex((entry) => entry.userId === viewerUserId);
    const previous = others[currentPosition - 1];

    if (previous) {
      set({
        viewerUserId: previous.userId,
        viewerIndex: Math.max(previous.statuses.length - 1, 0),
      });
    }
  },

  // ---------------- Socket ----------------

  subscribeToStatusEvents: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    get().unsubscribeFromStatusEvents();

    // A contact posted something — refetch rather than splicing it in, so
    // ordering (unseen first, newest next) stays the server's call.
    statusNewHandler = () => get().getStatuses();
    socket.on("status:new", statusNewHandler);

    statusDeletedHandler = () => get().getStatuses();
    socket.on("status:deleted", statusDeletedHandler);

    // Someone watched one of mine. Only my own bucket carries a viewer
    // list, so this patches it in place instead of refetching.
    statusSeenHandler = ({ statusId, viewer, seenAt }) => {
      set((state) => {
        if (!state.mine) return state;
        return {
          mine: {
            ...state.mine,
            statuses: state.mine.statuses.map((status) => {
              if (status._id !== statusId) return status;
              const viewers = status.viewers || [];
              if (viewers.some((entry) => String(entry.userId?._id || entry.userId) === viewer._id))
                return status;
              return {
                ...status,
                viewers: [...viewers, { userId: viewer, seenAt }],
                viewerCount: (status.viewerCount || 0) + 1,
              };
            }),
          },
        };
      });
    };
    socket.on("status:seen", statusSeenHandler);
  },

  unsubscribeFromStatusEvents: () => {
    const socket = useAuthStore.getState().socket;
    if (socket) {
      if (statusNewHandler) socket.off("status:new", statusNewHandler);
      if (statusSeenHandler) socket.off("status:seen", statusSeenHandler);
      if (statusDeletedHandler) socket.off("status:deleted", statusDeletedHandler);
    }
    statusNewHandler = null;
    statusSeenHandler = null;
    statusDeletedHandler = null;
  },

  // Drops anything that crossed its 24h mark while the tab sat open.
  pruneExpiredStatuses: () => {
    set((state) => ({
      mine: pruneBucket(state.mine),
      others: state.others.map(pruneBucket).filter(Boolean),
    }));
  },
}));
