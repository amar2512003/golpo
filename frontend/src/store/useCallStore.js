import { create } from "zustand";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuthStore";
import {
  attachLocalMedia,
  canShareScreen,
  captureScreen,
  getVideoSender,
  resolveRemoteStream,
  stopStream,
} from "../lib/screenShare";

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

  // Screen sharing. The camera track stays in `localStream` the whole
  // time (we only stop *sending* it, via replaceTrack) so switching
  // back is instant and doesn't need another getUserMedia prompt.
  isScreenSharing: false,
  screenStream: null,
  remoteSharing: false, // the other person is currently presenting

  startCall: async (targetUser, callType = "video") => {
    const socket = useAuthStore.getState().socket;
    const myId = useAuthStore.getState().authUser._id;

    if (!socket) return;

    const localStream = await navigator.mediaDevices.getUserMedia({
      video: callType === "video",
      audio: true,
    });

    const pc = new RTCPeerConnection(ICE_SERVERS);

    attachLocalMedia(pc, localStream);

    pc.ontrack = (event) => {
      set({
        remoteStream: resolveRemoteStream(event, get().remoteStream),
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

    attachLocalMedia(pc, localStream);

    pc.ontrack = (event) => {
      set({
        remoteStream: resolveRemoteStream(event, get().remoteStream),
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

  // ---------------- Screen sharing ----------------

  // Swaps the screen into the existing video sender with replaceTrack().
  // Same m-line, same connection — no new offer/answer round-trip.
  startScreenShare: async () => {
    const socket = useAuthStore.getState().socket;
    const { peerConnection, callStatus, isScreenSharing, callPartner } = get();

    if (!peerConnection || callStatus !== "connected" || isScreenSharing) return;

    if (!canShareScreen()) {
      toast.error("Screen sharing isn't supported on this device");
      return;
    }

    let screenStream;
    try {
      screenStream = await captureScreen();
    } catch (err) {
      console.error("Error starting screen share:", err);
      toast.error("Couldn't start screen sharing");
      return;
    }

    if (!screenStream) return; // picker dismissed

    // The call may have ended (or been replaced) while the picker was open.
    if (get().peerConnection !== peerConnection || get().callStatus !== "connected") {
      stopStream(screenStream);
      return;
    }

    const screenTrack = screenStream.getVideoTracks()[0];
    const sender = getVideoSender(peerConnection);

    if (!screenTrack || !sender) {
      stopStream(screenStream);
      toast.error("Couldn't start screen sharing");
      return;
    }

    try {
      await sender.replaceTrack(screenTrack);
    } catch (err) {
      console.error("Error sending screen track:", err);
      stopStream(screenStream);
      toast.error("Couldn't start screen sharing");
      return;
    }

    // Call ended while the swap was in flight.
    if (get().peerConnection !== peerConnection) {
      stopStream(screenStream);
      return;
    }

    // Fires when the user hits the browser's own "Stop sharing" bar, so
    // our state can't get out of sync with what the browser is doing.
    screenTrack.onended = () => get().stopScreenShare();

    set({ screenStream, isScreenSharing: true });

    if (socket && callPartner) {
      socket.emit("call:screen-share", {
        toUserId: callPartner._id,
        sharing: true,
      });
    }
  },

  stopScreenShare: () => {
    const socket = useAuthStore.getState().socket;
    const { peerConnection, screenStream, localStream, callPartner, isScreenSharing } = get();

    if (!isScreenSharing) return;

    // Update state first so this is safe to call twice (e.g. our own
    // button plus the browser's stop bar firing `ended`).
    stopStream(screenStream);
    set({ screenStream: null, isScreenSharing: false });

    // Back to the camera — or, in an audio call, to sending nothing.
    const cameraTrack = localStream?.getVideoTracks()[0] || null;
    const sender = peerConnection ? getVideoSender(peerConnection) : null;
    sender?.replaceTrack(cameraTrack).catch((err) => {
      console.error("Error restoring camera track:", err);
    });

    if (socket && callPartner) {
      socket.emit("call:screen-share", {
        toUserId: callPartner._id,
        sharing: false,
      });
    }
  },

  handleRemoteScreenShare: ({ fromUserId, sharing }) => {
    if (get().callPartner?._id !== fromUserId) return;
    set({ remoteSharing: !!sharing });
  },

  resetCall: () => {
    const {
      peerConnection,
      localStream,
      screenStream,
    } = get();

    peerConnection?.close();

    localStream?.getTracks().forEach((track) => {
      track.stop();
    });

    stopStream(screenStream);

    set({
      callStatus: "idle",
      peerConnection: null,
      localStream: null,
      remoteStream: null,
      callPartner: null,
      incomingOffer: null,
      callType: "video",
      isScreenSharing: false,
      screenStream: null,
      remoteSharing: false,
    });
  },
}));