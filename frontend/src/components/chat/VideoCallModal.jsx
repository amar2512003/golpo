import { useEffect, useRef, useState } from "react";
import { Avatar, Button } from "@heroui/react";
import { PhoneOffIcon, PhoneIcon, ScreenShareIcon, ScreenShareOffIcon, SwitchCameraIcon } from "lucide-react";
import { useCallStore } from "../../store/useCallStore";
import { canShareScreen } from "../../lib/screenShare";
import { useCanFlipCamera } from "../../hooks/useCanFlipCamera";

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function CallerAvatar({ name, avatarUrl, pulsing, large }) {
  return (
    <div className="relative flex items-center justify-center">
      {pulsing ? (
        <>
          <span className="absolute size-32 animate-ping rounded-full bg-[#5b6dfa]/20 [animation-duration:2s] sm:size-44" />
          <span className="absolute size-24 animate-ping rounded-full bg-[#5b6dfa]/25 [animation-duration:2s] [animation-delay:.3s] sm:size-36" />
        </>
      ) : null}

      <Avatar className={`relative ${large ? "h-36 w-36" : "h-28 w-28"} ring-4 ring-white/10`}>
        <Avatar.Image src={avatarUrl} alt={name} />
        <Avatar.Fallback className="text-4xl">{name?.[0]}</Avatar.Fallback>
      </Avatar>
    </div>
  );
}

function CallButton({ onPress, variant, label, active, disabled, children }) {
  let tone = "bg-red-500 hover:bg-red-400";
  if (variant === "accept") tone = "bg-emerald-500 hover:bg-emerald-400";
  // "toggle" stays lit while on; "action" is a one-shot button (flip camera).
  if (variant === "toggle") {
    tone = active ? "bg-[#5b6dfa] hover:bg-[#7180fb]" : "bg-white/10 hover:bg-white/20 backdrop-blur-md";
  }
  if (variant === "action") tone = "bg-white/10 hover:bg-white/20 backdrop-blur-md";

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        isIconOnly
        onPress={onPress}
        isDisabled={disabled}
        aria-label={label}
        aria-pressed={variant === "toggle" ? !!active : undefined}
        className={`h-14 w-14 rounded-full text-white shadow-lg shadow-black/30 ${tone}`}
      >
        {children}
      </Button>
      <span className="text-xs text-white/60">{label}</span>
    </div>
  );
}

export function VideoCallModal() {
  const callStatus = useCallStore((state) => state.callStatus);
  const callType = useCallStore((state) => state.callType);
  const localStream = useCallStore((state) => state.localStream);
  const remoteStream = useCallStore((state) => state.remoteStream);
  const callPartner = useCallStore((state) => state.callPartner);
  const acceptCall = useCallStore((state) => state.acceptCall);
  const rejectCall = useCallStore((state) => state.rejectCall);
  const endCall = useCallStore((state) => state.endCall);
  const isScreenSharing = useCallStore((state) => state.isScreenSharing);
  const remoteSharing = useCallStore((state) => state.remoteSharing);
  const startScreenShare = useCallStore((state) => state.startScreenShare);
  const stopScreenShare = useCallStore((state) => state.stopScreenShare);
  const flipCamera = useCallStore((state) => state.flipCamera);
  const isFlippingCamera = useCallStore((state) => state.isFlippingCamera);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const [duration, setDuration] = useState(0);

  const isVideo = callType === "video";
  // An audio call flips to the video layout while the other person is
  // presenting, so their screen has somewhere to render.
  const showVideoLayout = isVideo || remoteSharing;

  // Offer "Flip camera" only on a video call that has our camera open and
  // a second camera to flip to (i.e. phones, or a laptop with two webcams).
  const canFlipCamera = useCanFlipCamera(isVideo && !!localStream);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isVideo]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }

    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;

      // Chrome sometimes requires play() after attaching srcObject
      remoteAudioRef.current
        .play()
        .catch((err) => console.log("Audio autoplay blocked:", err));
    }
  }, [remoteStream, showVideoLayout]);

  useEffect(() => {
    if (callStatus !== "connected") {
      setDuration(0);
      return;
    }

    const timer = setInterval(() => setDuration((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [callStatus]);

  if (callStatus === "idle") return null;

  const isRinging = callStatus === "calling" || callStatus === "incoming";

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#080b14]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[#5b6dfa]/25 blur-[110px]" />
        <div className="absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-[#22c3a6]/20 blur-[110px]" />
      </div>

      <div className="relative z-10 flex items-center justify-between px-5 pt-5 sm:px-8">
        <div className="flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5 backdrop-blur-md">
          <span
            className={`size-2 rounded-full ${
              callStatus === "connected" ? "bg-emerald-400" : "animate-pulse bg-amber-400"
            }`}
          />
          <span className="text-xs font-medium text-white/80">
            {callStatus === "calling" && "Calling…"}
            {callStatus === "incoming" && "Incoming call"}
            {callStatus === "connected" && formatDuration(duration)}
          </span>
        </div>

        {isScreenSharing ? (
          <div className="flex items-center gap-2 rounded-full bg-[#5b6dfa]/80 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">
            <ScreenShareIcon className="size-3.5" aria-hidden />
            Sharing screen
          </div>
        ) : null}

        <div className="rounded-full bg-white/8 px-3 py-1.5 text-xs font-medium text-white/60 backdrop-blur-md">
          {isVideo ? "Video call" : "Audio call"}
        </div>
      </div>

      {showVideoLayout ? (
        <div className="relative z-0 flex h-full w-full flex-1 items-center justify-center overflow-hidden">
          {remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={`h-full w-full ${remoteSharing ? "bg-black object-contain" : "object-cover"}`}
            />
          ) : (
            <CallerAvatar name={callPartner?.fullName} avatarUrl={callPartner?.profilePic} pulsing={isRinging} />
          )}

          {/* Scrims keep the overlaid UI legible over camera video; they'd
              just dim a shared screen, so they're skipped while presenting. */}
          {!remoteSharing ? (
            <>
              <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/70 to-transparent" />
            </>
          ) : null}

          {!remoteStream ? (
            <p className="absolute bottom-28 left-1/2 -translate-x-1/2 text-center text-base font-medium text-white/80">
              {callPartner?.fullName}
            </p>
          ) : null}

          {localStream && isVideo ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute right-4 top-20 w-28 rounded-2xl border-2 border-white/70 object-cover shadow-2xl shadow-black/40 sm:right-6 sm:w-40"
            />
          ) : null}
        </div>
      ) : (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-6">
          <CallerAvatar name={callPartner?.fullName} avatarUrl={callPartner?.profilePic} pulsing={isRinging} large />

          <div className="text-center">
            <h2 className="text-2xl font-semibold text-white">{callPartner?.fullName}</h2>
            <p className="mt-2 text-sm text-white/50">
              {callStatus === "calling" && "Calling…"}
              {callStatus !== "calling" && "Audio call"}
            </p>
          </div>

          {/* Hidden element that plays the remote audio */}
          <audio ref={remoteAudioRef} autoPlay playsInline />
        </div>
      )}

      <div className="relative z-10 mb-10 mt-6 flex items-center justify-center gap-6 px-6">
        {callStatus === "incoming" ? (
          <>
            <CallButton onPress={rejectCall} variant="reject" label="Decline">
              <PhoneOffIcon className="size-6" />
            </CallButton>

            <CallButton onPress={acceptCall} variant="accept" label="Accept">
              <PhoneIcon className="size-6" />
            </CallButton>
          </>
        ) : (
          <>
            {canFlipCamera ? (
              <CallButton
                onPress={flipCamera}
                variant="action"
                disabled={isFlippingCamera}
                label="Flip camera"
              >
                <SwitchCameraIcon className={`size-6 ${isFlippingCamera ? "animate-pulse" : ""}`} />
              </CallButton>
            ) : null}

            {callStatus === "connected" && canShareScreen() ? (
              <CallButton
                onPress={isScreenSharing ? stopScreenShare : startScreenShare}
                variant="toggle"
                active={isScreenSharing}
                label={isScreenSharing ? "Stop sharing" : "Share screen"}
              >
                {isScreenSharing ? (
                  <ScreenShareOffIcon className="size-6" />
                ) : (
                  <ScreenShareIcon className="size-6" />
                )}
              </CallButton>
            ) : null}

            <CallButton onPress={endCall} variant="reject" label="End call">
              <PhoneOffIcon className="size-6" />
            </CallButton>
          </>
        )}
      </div>
    </div>
  );
}
