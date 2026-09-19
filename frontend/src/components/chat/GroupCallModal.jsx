import { useEffect, useRef, useState } from "react";
import { Avatar, Button } from "@heroui/react";
import {
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  VideoIcon,
  VideoOffIcon,
} from "lucide-react";
import { useGroupCallStore } from "../../store/useGroupCallStore";
import { useGroupStore } from "../../store/useGroupStore";
import { useAuthStore } from "../../store/useAuthStore";
import { getInitials } from "../../hooks/useSelectedConversation";

// Literal Tailwind class strings — Tailwind's build only picks up class
// names it can see verbatim in source, so this can't be built from a
// template string like `grid-cols-${n}`.
const GRID_COLS_BY_COUNT = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-2",
  4: "grid-cols-2",
  5: "grid-cols-2 sm:grid-cols-3",
  6: "grid-cols-2 sm:grid-cols-3",
};

function gridColsClass(count) {
  return GRID_COLS_BY_COUNT[count] || GRID_COLS_BY_COUNT[6];
}

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function CallTile({ stream, name, avatarUrl, isVideo, muted, cameraOff, isLocal, connectionState, speaking }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const showVideo = isVideo && stream && !cameraOff;

  // A muted participant can't be the one making noise, whatever the
  // analyser thinks it heard (e.g. bleed from other tiles' speakers).
  const showSpeakingRing = speaking && !muted;

  return (
    <div
      className={`relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border bg-gradient-to-br from-[#1a2033] to-[#0e1220] transition-shadow ${
        showSpeakingRing ? "border-emerald-400/70 shadow-[0_0_0_3px_rgba(52,211,153,0.25)]" : "border-white/10"
      }`}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="h-full w-full object-cover"
        />
      ) : (
        <Avatar className="h-16 w-16 ring-2 ring-white/10">
          <Avatar.Image src={avatarUrl} alt={name} />
          <Avatar.Fallback className="text-xl">
            {getInitials(name || "?")}
          </Avatar.Fallback>
        </Avatar>
      )}

      {!isLocal && connectionState === "connecting" ? (
        <span className="absolute inset-x-0 top-2 text-center text-xs text-gray-300">
          Connecting…
        </span>
      ) : null}

      {!isLocal && connectionState === "reconnecting" ? (
        <span className="absolute inset-x-0 top-2 text-center text-xs text-amber-300">
          Reconnecting…
        </span>
      ) : null}

      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 backdrop-blur-sm">
        {muted ? <MicOffIcon className="size-3.5 text-red-400" /> : null}
        {isVideo && cameraOff ? <VideoOffIcon className="size-3.5 text-gray-300" /> : null}
        <span className="max-w-28 truncate text-xs font-medium text-white">
          {isLocal ? "You" : name}
        </span>
      </div>
    </div>
  );
}

function CallControlButton({ onPress, active, label, children }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        isIconOnly
        onPress={onPress}
        aria-label={label}
        className={`h-12 w-12 rounded-full backdrop-blur-md ${
          active ? "bg-red-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
        }`}
      >
        {children}
      </Button>
      <span className="text-xs text-white/60">{label}</span>
    </div>
  );
}

export function GroupCallModal() {
  const status = useGroupCallStore((state) => state.status);
  const groupId = useGroupCallStore((state) => state.groupId);
  const groupName = useGroupCallStore((state) => state.groupName);
  const callType = useGroupCallStore((state) => state.callType);
  const localStream = useGroupCallStore((state) => state.localStream);
  const localMuted = useGroupCallStore((state) => state.localMuted);
  const localCameraOff = useGroupCallStore((state) => state.localCameraOff);
  const localSpeaking = useGroupCallStore((state) => state.localSpeaking);
  const peers = useGroupCallStore((state) => state.peers);
  const toggleMute = useGroupCallStore((state) => state.toggleMute);
  const toggleCamera = useGroupCallStore((state) => state.toggleCamera);
  const leaveCall = useGroupCallStore((state) => state.leaveCall);

  const groups = useGroupStore((state) => state.groups);
  const authUser = useAuthStore((state) => state.authUser);

  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (status !== "in-call") {
      setDuration(0);
      return;
    }

    const timer = setInterval(() => setDuration((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  if (status === "idle") return null;

  const group = groups.find((g) => g._id === groupId);
  const membersById = new Map((group?.members || []).map((m) => [m._id, m]));

  const peerEntries = Object.entries(peers);
  const tileCount = peerEntries.length + 1; // + local tile

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#080b14] p-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[#5b6dfa]/20 blur-[120px]" />
        <div className="absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-[#22c3a6]/15 blur-[120px]" />
      </div>

      <div className="relative z-10 mb-4 mt-1 flex items-center justify-between px-1 sm:px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar className="h-9 w-9 shrink-0 ring-2 ring-white/10">
            <Avatar.Fallback className="text-sm">{getInitials(groupName || "?")}</Avatar.Fallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-white">
              {groupName || "Group call"}
            </p>
            <p className="text-xs text-white/50">{tileCount} on the call</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 rounded-full bg-white/8 px-3 py-1.5 backdrop-blur-md">
          <span
            className={`size-2 rounded-full ${
              status === "in-call" ? "bg-emerald-400" : "animate-pulse bg-amber-400"
            }`}
          />
          <span className="text-xs font-medium text-white/80">
            {status === "joining" && "Joining…"}
            {status === "reconnecting" && "Reconnecting…"}
            {status === "in-call" && formatDuration(duration)}
          </span>
        </div>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center overflow-y-auto">
        <div className={`grid w-full max-w-4xl gap-3 ${gridColsClass(tileCount)}`}>
          <CallTile
            stream={localStream}
            name={authUser?.fullName}
            avatarUrl={authUser?.profilePic}
            isVideo={callType === "video"}
            muted={localMuted}
            cameraOff={localCameraOff}
            speaking={localSpeaking}
            isLocal
          />

          {peerEntries.map(([userId, peer]) => {
            const member = membersById.get(userId);
            return (
              <CallTile
                key={userId}
                stream={peer.stream}
                name={member?.fullName || "Member"}
                avatarUrl={member?.profilePic}
                isVideo={callType === "video"}
                muted={peer.muted}
                cameraOff={peer.cameraOff}
                speaking={peer.speaking}
                connectionState={peer.connectionState}
              />
            );
          })}
        </div>
      </div>

      <div className="relative z-10 mb-6 mt-6 flex items-center justify-center gap-6">
        <CallControlButton
          onPress={toggleMute}
          active={localMuted}
          label={localMuted ? "Unmute" : "Mute"}
        >
          {localMuted ? <MicOffIcon className="size-5" /> : <MicIcon className="size-5" />}
        </CallControlButton>

        {callType === "video" ? (
          <CallControlButton
            onPress={toggleCamera}
            active={localCameraOff}
            label={localCameraOff ? "Start video" : "Stop video"}
          >
            {localCameraOff ? <VideoOffIcon className="size-5" /> : <VideoIcon className="size-5" />}
          </CallControlButton>
        ) : null}

        <div className="flex flex-col items-center gap-2">
          <Button
            isIconOnly
            className="h-14 w-14 rounded-full bg-red-500 text-white shadow-lg shadow-black/30 hover:bg-red-400"
            onPress={leaveCall}
            aria-label="Leave call"
          >
            <PhoneOffIcon className="size-6" />
          </Button>
          <span className="text-xs text-white/60">Leave</span>
        </div>
      </div>
    </div>
  );
}
