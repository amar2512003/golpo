// Shared helpers for screen sharing over WebRTC. Used by both the 1:1
// call store and the group (mesh) call store so the two can't drift apart.

// getDisplayMedia doesn't exist on most mobile browsers (and needs a
// secure context everywhere), so the UI checks this before offering a
// "Share screen" button at all rather than failing on click.
export function canShareScreen() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function"
  );
}

// Opens the browser's screen/window/tab picker. Must be called from a
// user gesture. Resolves to a MediaStream, or null if the user simply
// dismissed the picker (not an error worth surfacing). Any other
// failure is thrown for the caller to report.
export async function captureScreen() {
  try {
    return await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
      // Hides "this tab" from the picker in browsers that support it —
      // sharing the call window into the call is just an infinite mirror.
      selfBrowserSurface: "exclude",
    });
  } catch (err) {
    if (err?.name === "NotAllowedError" || err?.name === "AbortError") return null;
    throw err;
  }
}

// The RTCRtpSender that carries our outgoing video, or null.
//
// This deliberately looks at transceivers rather than
// `pc.getSenders().find(s => s.track?.kind === "video")`: a sender whose
// track is currently null (audio-only call, or after we stop sharing in
// one) has no `track.kind` to match on, but its transceiver's receiver
// still knows it's a video m-line.
export function getVideoSender(pc) {
  const transceiver = pc
    .getTransceivers()
    .find((t) => t.receiver?.track?.kind === "video");
  return transceiver?.sender ?? null;
}

// Wires our local media into a fresh RTCPeerConnection.
//
// Audio is added as usual. For video we always make sure the connection
// has a video m-line, even for audio-only calls: if there's no camera
// track we add an empty send/receive video transceiver instead. That's
// what lets screen sharing work later via replaceTrack() with no SDP
// renegotiation — adding a *new* track mid-call would need a fresh
// offer/answer round-trip, which the 1:1 signaling has no path for.
//
// `videoTrackOverride` lets a connection that's created while we're
// already presenting (e.g. someone joins a group call mid-share) start
// out sending the screen instead of the camera.
export function attachLocalMedia(pc, localStream, videoTrackOverride = null) {
  localStream.getAudioTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  const videoTrack = videoTrackOverride || localStream.getVideoTracks()[0];

  if (videoTrack) {
    pc.addTrack(videoTrack, localStream);
  } else {
    pc.addTransceiver("video", { direction: "sendrecv", streams: [localStream] });
  }
}

export function stopStream(stream) {
  stream?.getTracks().forEach((track) => {
    track.onended = null;
    track.stop();
  });
}

// Picks the MediaStream an incoming track belongs to. Normally that's
// just `event.streams[0]`; the fallback covers a sender that didn't
// tag its track with a stream id, by folding the track into whatever
// remote stream we already have instead of replacing it (which would
// silently drop the audio when the video track shows up, or vice versa).
export function resolveRemoteStream(event, currentStream = null) {
  const stream = event.streams?.[0] || currentStream || new MediaStream();
  if (!stream.getTracks().includes(event.track)) {
    stream.addTrack(event.track);
  }
  return stream;
}
