import { create } from "zustand";
import { useAuthStore } from "./useAuthStore";

const ICE_SERVERS = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export const useCallStore = create((set, get) => ({
  callStatus: "idle", // idle | calling | incoming | connected
  peerConnection: null,
  localStream: null,
  remoteStream: null,
  callPartner: null, // { _id, fullName, profilePic }
  incomingOffer: null,
  callType: "video", // "video" | "audio"

  startCall: async (targetUser, callType = "video") => {
    const socket = useAuthStore.getState().socket;
    const myId = useAuthStore.getState().authUser._id;

    if (!socket) return;

    const localStream = await navigator.mediaDevices.getUserMedia({
      video: callType === "video",
      audio: true,
    });

    const pc = new RTCPeerConnection(ICE_SERVERS);

    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    pc.ontrack = (event) => {
      set({
        remoteStream: event.streams[0],
      });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("call:ice-candidate", {
          toUserId: targetUser._id,
          candidate: event.candidate,
        });
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit("call:offer", {
      toUserId: targetUser._id,
      fromUserId: myId,
      offer,
      callType,
    });

    set({
      peerConnection: pc,
      localStream,
      callStatus: "calling",
      callPartner: targetUser,
      callType,
    });
  },

  receiveOffer: ({ fromUserId, offer, callType }, callerInfo) => {
    set({
      callStatus: "incoming",
      incomingOffer: offer,
      callPartner: {
        _id: fromUserId,
        ...callerInfo,
      },
      callType,
    });
  },

  acceptCall: async () => {
    const socket = useAuthStore.getState().socket;

    const {
      incomingOffer,
      callPartner,
      callType,
    } = get();

    if (!socket || !incomingOffer || !callPartner) return;

    const localStream = await navigator.mediaDevices.getUserMedia({
      video: callType === "video",
      audio: true,
    });

    const pc = new RTCPeerConnection(ICE_SERVERS);

    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    pc.ontrack = (event) => {
      set({
        remoteStream: event.streams[0],
      });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("call:ice-candidate", {
          toUserId: callPartner._id,
          candidate: event.candidate,
        });
      }
    };

    await pc.setRemoteDescription(
      new RTCSessionDescription(incomingOffer)
    );

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("call:answer", {
      toUserId: callPartner._id,
      answer,
    });

    set({
      peerConnection: pc,
      localStream,
      callStatus: "connected",
    });
  },

  handleAnswer: async ({ answer }) => {
    const { peerConnection } = get();

    if (!peerConnection) return;

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer)
    );

    set({
      callStatus: "connected",
    });
  },

  handleIceCandidate: async ({ candidate }) => {
    const { peerConnection } = get();

    if (!peerConnection) return;

    try {
      await peerConnection.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
    } catch (err) {
      console.error("Error adding ICE candidate:", err);
    }
  },

  rejectCall: () => {
    const socket = useAuthStore.getState().socket;
    const { callPartner } = get();

    if (socket && callPartner) {
      socket.emit("call:reject", {
        toUserId: callPartner._id,
      });
    }

    get().resetCall();
  },

  endCall: () => {
    const socket = useAuthStore.getState().socket;
    const { callPartner } = get();

    if (socket && callPartner) {
      socket.emit("call:end", {
        toUserId: callPartner._id,
      });
    }

    get().resetCall();
  },

  resetCall: () => {
    const {
      peerConnection,
      localStream,
    } = get();

    peerConnection?.close();

    localStream?.getTracks().forEach((track) => {
      track.stop();
    });

    set({
      callStatus: "idle",
      peerConnection: null,
      localStream: null,
      remoteStream: null,
      callPartner: null,
      incomingOffer: null,
      callType: "video",
    });
  },
}));