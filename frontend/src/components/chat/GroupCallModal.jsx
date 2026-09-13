import { useEffect, useRef } from "react";
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
      className={`relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-zinc-900 transition-shadow ${
        showSpeakingRing ? "ring-2 ring-green-400 ring-offset-2 ring-offset-black" : ""
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
        <Avatar className="h-16 w-16">
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

      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1">
        {muted ? <MicOffIcon className="size-3.5 text-red-400" /> : null}
        {isVideo && cameraOff ? <VideoOffIcon className="size-3.5 text-gray-300" /> : null}
        <span className="max-w-28 truncate text-xs text-white">
          {isLocal ? "You" : name}
        </span>
      </div>
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

  if (status === "idle") return null;

  const group = groups.find((g) => g._id === groupId);
  const membersById = new Map((group?.members || []).map((m) => [m._id, m]));

  const peerEntries = Object.entries(peers);
  const tileCount = peerEntries.length + 1; // + local tile

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 p-4">
      <p className="mb-4 mt-2 text-center text-lg text-white">
        {status === "joining"
          ? `Joining ${groupName || "call"}…`
          : status === "reconnecting"
          ? `Reconnecting to ${groupName || "call"}…`
          : groupName}
      </p>

      <div className="flex flex-1 items-center justify-center overflow-y-auto">
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

      <div className="mb-4 mt-6 flex justify-center gap-4">
        <Button
          isIconOnly
          className={localMuted ? "bg-red-500 text-white" : "bg-white/15 text-white"}
          onPress={toggleMute}
          aria-label={localMuted ? "Unmute" : "Mute"}
        >
          {localMuted ? <MicOffIcon className="size-5" /> : <MicIcon className="size-5" />}
        </Button>

        {callType === "video" ? (
          <Button
            isIconOnly
            className={localCameraOff ? "bg-red-500 text-white" : "bg-white/15 text-white"}
            onPress={toggleCamera}
            aria-label={localCameraOff ? "Turn camera on" : "Turn camera off"}
          >
            {localCameraOff ? (
              <VideoOffIcon className="size-5" />
            ) : (
              <VideoIcon className="size-5" />
            )}
          </Button>
        ) : null}

        <Button
          isIconOnly
          className="bg-red-500 text-white"
          onPress={leaveCall}
          aria-label="Leave call"
        >
          <PhoneOffIcon className="size-5" />
        </Button>
      </div>
    </div>
  );
}
