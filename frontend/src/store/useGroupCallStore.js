import { create } from "zustand";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";

const ICE_SERVERS = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// How many ICE restarts we'll try on one peer connection before giving up
// and treating it like a normal departure.
const MAX_ICE_RESTART_ATTEMPTS = 3;

// Volume threshold (0-255, from the analyser's byte time-domain data) and
// how often we sample it. Low enough to catch normal speech, high enough
// to ignore mic hiss/background noise.
const SPEAKING_VOLUME_THRESHOLD = 12;
const SPEAKING_POLL_MS = 250;

// RTCPeerConnection instances (plus a little bookkeeping) live outside
// zustand state — they're not serializable/comparable, and we never need
// a re-render just because a connection object's internal fields changed.
// Keyed by the remote userId, same as `peers` below, so the two always
// stay in lockstep.
// userId -> { pc, initiator, restartAttempts }
const peerConnections = new Map();

// Lazily-created single AudioContext shared across every analyser so we
// don't spin up one per participant (browsers cap how many can run).
let sharedAudioContext = null;

// userId (or "local") -> { source, analyser, dataArray, intervalId }
const audioMonitors = new Map();

function myId() {
  return useAuthStore.getState().authUser?._id;
}

function socket() {
  return useAuthStore.getState().socket;
}

// Tears down one peer connection (if it exists) without touching
// anything else — used for both a graceful leave and a hard cleanup.
function closePeerConnection(userId) {
  const entry = peerConnections.get(userId);
  entry?.pc.close();
  peerConnections.delete(userId);
  stopAudioMonitor(userId);
}

function getAudioContext() {
  if (!sharedAudioContext) {
    sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (sharedAudioContext.state === "suspended") {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

// Starts polling a stream's volume so the UI can highlight whoever is
// currently talking. `onSpeakingChange` is only called when the boolean
// actually flips, so callers don't need to debounce re-renders themselves.
function startAudioMonitor(key, stream, onSpeakingChange) {
  if (!stream || !stream.getAudioTracks().length) return;
  stopAudioMonitor(key);

  let analyser;
  let source;
  try {
    const ctx = getAudioContext();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
  } catch (err) {
    console.error("Error setting up audio monitor:", err);
    return;
  }

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  let wasSpeaking = false;

  const intervalId = setInterval(() => {
    analyser.getByteTimeDomainData(dataArray);

    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const centered = dataArray[i] - 128;
      sumSquares += centered * centered;
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);
    const isSpeaking = rms > SPEAKING_VOLUME_THRESHOLD;

    if (isSpeaking !== wasSpeaking) {
      wasSpeaking = isSpeaking;
      onSpeakingChange(isSpeaking);
    }
  }, SPEAKING_POLL_MS);

  audioMonitors.set(key, { source, analyser, intervalId });
}

function stopAudioMonitor(key) {
  const monitor = audioMonitors.get(key);
  if (!monitor) return;

  clearInterval(monitor.intervalId);
  try {
    monitor.source.disconnect();
  } catch {
    // already disconnected — fine
  }
  audioMonitors.delete(key);
}

function stopAllAudioMonitors() {
  Array.from(audioMonitors.keys()).forEach(stopAudioMonitor);
}

export const useGroupCallStore = create((set, get) => ({
  status: "idle", // idle | joining | reconnecting | in-call
  groupId: null,
  groupName: null,
  callType: "video", // "video" | "audio"
  localStream: null,
  localMuted: false,
  localCameraOff: false,
  localSpeaking: false,

  // userId -> { stream, connectionState, muted, cameraOff, speaking }
  peers: {},

  joinCall: async (group, callType = "video") => {
    const s = socket();
    const uid = myId();

    if (!s || !uid || !group?._id) return;
    if (get().status !== "idle") return; // already joining/in a call

    set({ status: "joining", groupId: group._id, groupName: group.name, callType });

    let localStream;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: callType === "video",
        audio: true,
      });
    } catch (err) {
      console.error("Error getting local media:", err);
      toast.error("Couldn't access camera/microphone");
      set({ status: "idle", groupId: null, groupName: null });
      return;
    }

    set({ localStream });
    startAudioMonitor("local", localStream, (speaking) => set({ localSpeaking: speaking }));

    s.emit(
      "call:group-join",
      { groupId: group._id, callType },
      (response) => {
        if (!response || response.error) {
          toast.error(response?.error || "Couldn't join the call");
          get()._teardown();
          return;
        }

        set({ status: "in-call" });

        // Existing participants: we're the newcomer, so we initiate a
        // peer connection + offer to each of them.
        response.participants.forEach(({ userId }) => {
          get()._createPeerConnection(userId, { initiator: true });
        });
      }
    );
  },

  // Called when the signaling socket comes back up after a drop — either
  // a full reconnect (see useAuthStore) or nothing to do if we're not
  // actually in a call. Old peer connections were negotiated over the
  // dead socket session and the other side has almost certainly already
  // been told we left (see socket.js disconnect handling), so we drop
  // them and rejoin fresh rather than trying to resuscitate them.
  handleSocketReconnect: () => {
    const { status, groupId, callType, localStream } = get();
    if (status === "idle" || !groupId) return;

    const s = socket();
    if (!s || !localStream || !localStream.getTracks().some((t) => t.readyState === "live")) {
      // Local media itself died (e.g. device went to sleep) — nothing
      // sensible to rejoin with.
      get()._teardown();
      return;
    }

    peerConnections.forEach((_entry, userId) => closePeerConnection(userId));
    peerConnections.clear();
    set({ status: "reconnecting", peers: {} });

    s.emit("call:group-join", { groupId, callType }, (response) => {
      if (get().status !== "reconnecting") return; // left/torn down meanwhile

      if (!response || response.error) {
        toast.error(response?.error || "Couldn't reconnect to the call");
        get()._teardown();
        return;
      }

      set({ status: "in-call" });
      response.participants.forEach(({ userId }) => {
        get()._createPeerConnection(userId, { initiator: true });
      });
    });
  },

  // If we're removed from a group (or it's deleted) while on a call for
  // it, there's nothing left to be connected to — leave quietly instead
  // of lingering in a call for a group we're no longer part of.
  forceLeaveForGroup: (groupId) => {
    const state = get();
    if (state.status === "idle" || state.groupId !== groupId) return;

    toast("You're no longer in this group — leaving the call");
    socket()?.emit("call:group-leave", { groupId });
    get()._teardown();
  },

  // Called when call:group-user-joined arrives — someone else joined
  // after us. We don't initiate anything here; we just make sure a
  // placeholder tile exists so they show up as "connecting" while we
  // wait for their incoming offer.
  handleUserJoined: ({ userId }) => {
    if (userId === myId()) return;

    set((state) => ({
      peers: {
        ...state.peers,
        [userId]: state.peers[userId] || {
          stream: null,
          connectionState: "connecting",
          muted: false,
          cameraOff: false,
          speaking: false,
        },
      },
    }));
  },

  handleOffer: async ({ fromUserId, offer, callType }) => {
    const { status, groupId } = get();
    if (status === "idle" || !groupId) return;

    const pc = get()._createPeerConnection(fromUserId, { initiator: false });
    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket()?.emit("call:answer", {
        toUserId: fromUserId,
        fromUserId: myId(),
        answer,
        groupId,
        callType,
      });
    } catch (err) {
      console.error("Error handling group call offer:", err);
    }
  },

  handleAnswer: async ({ fromUserId, answer }) => {
    const pc = peerConnections.get(fromUserId)?.pc;
    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error("Error handling group call answer:", err);
    }
  },

  handleIceCandidate: async ({ fromUserId, candidate }) => {
    const pc = peerConnections.get(fromUserId)?.pc;
    if (!pc) return;

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error("Error adding group call ICE candidate:", err);
    }
  },

  // One peer dropped (left, or their socket disconnected) — tear down
  // just that connection, everyone else stays up.
  handleUserLeft: ({ userId }) => {
    closePeerConnection(userId);

    set((state) => {
      const peers = { ...state.peers };
      delete peers[userId];
      return { peers };
    });
  },

  // Server force-ended the call (e.g. everyone else already left).
  handleCallEnded: () => {
    toast("Call ended");
    get()._teardown();
  },

  handleRemoteMediaState: ({ userId, muted, cameraOff }) => {
    set((state) => {
      const existing = state.peers[userId];
      if (!existing) return state;

      return {
        peers: {
          ...state.peers,
          [userId]: { ...existing, muted, cameraOff },
        },
      };
    });
  },

  leaveCall: () => {
    const { groupId } = get();
    if (groupId) {
      socket()?.emit("call:group-leave", { groupId });
    }
    get()._teardown();
  },

  toggleMute: () => {
    const { localStream, localMuted, groupId } = get();
    const audioTrack = localStream?.getAudioTracks()[0];
    if (!audioTrack) return;

    audioTrack.enabled = localMuted; // flipping: currently muted -> enable
    set({ localMuted: !localMuted });

    socket()?.emit("call:group-media-state", {
      groupId,
      muted: !localMuted,
      cameraOff: get().localCameraOff,
    });
  },

  toggleCamera: () => {
    const { localStream, localCameraOff, groupId, callType } = get();
    if (callType !== "video") return;

    const videoTrack = localStream?.getVideoTracks()[0];
    if (!videoTrack) return;

    videoTrack.enabled = localCameraOff; // flipping: currently off -> enable
    set({ localCameraOff: !localCameraOff });

    socket()?.emit("call:group-media-state", {
      groupId,
      muted: get().localMuted,
      cameraOff: !localCameraOff,
    });
  },

  // ---------------- Internal ----------------

  // Creates (or returns the existing) RTCPeerConnection for a remote
  // participant, wiring up ontrack/onicecandidate either way.
  // `initiator: true` means we're the one who should send the offer
  // once the connection is set up (and, later, who drives ICE restarts
  // for this pair — see _attemptIceRestart).
  _createPeerConnection: (userId, { initiator }) => {
    const { localStream, groupId, callType } = get();
    const s = socket();

    if (!s || !localStream || !groupId) return null;
    if (peerConnections.has(userId)) return peerConnections.get(userId).pc;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.set(userId, { pc, initiator, restartAttempts: 0 });

    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    pc.ontrack = (event) => {
      const stream = event.streams[0];

      set((state) => ({
        peers: {
          ...state.peers,
          [userId]: {
            ...(state.peers[userId] || { muted: false, cameraOff: false, speaking: false }),
            stream,
            connectionState: "connected",
          },
        },
      }));

      startAudioMonitor(userId, stream, (speaking) => {
        set((state) => {
          const existing = state.peers[userId];
          if (!existing) return state;
          return { peers: { ...state.peers, [userId]: { ...existing, speaking } } };
        });
      });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        s.emit("call:ice-candidate", {
          toUserId: userId,
          fromUserId: myId(),
          candidate: event.candidate,
          groupId,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      set((state) => {
        const existing = state.peers[userId];
        if (!existing) return state;
        return {
          peers: {
            ...state.peers,
            [userId]: { ...existing, connectionState: pc.connectionState },
          },
        };
      });
    };

    // ICE (not the overall connection) is what actually flaps during a
    // brief network hiccup — recovering here means most blips never
    // surface to the user as a dropped tile at all.
    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;

      if (iceState === "failed" || iceState === "disconnected") {
        set((state) => {
          const existing = state.peers[userId];
          if (!existing) return state;
          return {
            peers: {
              ...state.peers,
              [userId]: { ...existing, connectionState: "reconnecting" },
            },
          };
        });
        get()._attemptIceRestart(userId);
      } else if (iceState === "connected" || iceState === "completed") {
        const entry = peerConnections.get(userId);
        if (entry) entry.restartAttempts = 0;
      }
    };

    set((state) => ({
      peers: {
        ...state.peers,
        [userId]: state.peers[userId] || {
          stream: null,
          connectionState: "connecting",
          muted: false,
          cameraOff: false,
          speaking: false,
        },
      },
    }));

    if (initiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer).then(() => offer))
        .then((offer) => {
          s.emit("call:offer", {
            toUserId: userId,
            fromUserId: myId(),
            offer,
            callType,
            groupId,
          });
        })
        .catch((err) => console.error("Error creating group call offer:", err));
    }

    return pc;
  },

  // Renegotiates one pairwise connection after its ICE path breaks,
  // instead of tearing down the whole call over what's often a
  // few-second Wi-Fi blip. Only the side that originally initiated the
  // connection restarts it, so both sides don't race each other with
  // competing offers (glare). The non-initiating side just waits for
  // the restart offer to arrive through the normal handleOffer path.
  _attemptIceRestart: (userId) => {
    const entry = peerConnections.get(userId);
    if (!entry || !entry.initiator) return;

    const { groupId, callType } = get();
    const s = socket();
    if (!s || !groupId) return;

    entry.restartAttempts += 1;

    if (entry.restartAttempts > MAX_ICE_RESTART_ATTEMPTS) {
      // Given it a fair shot — treat it like the peer left rather than
      // leaving a permanently-broken tile in the grid.
      get().handleUserLeft({ userId });
      toast(`Lost connection to a participant`);
      return;
    }

    entry.pc
      .createOffer({ iceRestart: true })
      .then((offer) => entry.pc.setLocalDescription(offer).then(() => offer))
      .then((offer) => {
        s.emit("call:offer", {
          toUserId: userId,
          fromUserId: myId(),
          offer,
          callType,
          groupId,
        });
      })
      .catch((err) => console.error("Error restarting ICE:", err));
  },

  _teardown: () => {
    const { localStream } = get();

    peerConnections.forEach((_entry, userId) => closePeerConnection(userId));
    peerConnections.clear();
    stopAllAudioMonitors();

    localStream?.getTracks().forEach((track) => track.stop());

    set({
      status: "idle",
      groupId: null,
      groupName: null,
      callType: "video",
      localStream: null,
      localMuted: false,
      localCameraOff: false,
      localSpeaking: false,
      peers: {},
    });
  },
}));
