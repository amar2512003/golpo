import { useEffect, useRef, useState } from "react";
import { Avatar, Button } from "@heroui/react";
import {
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  ScreenShareIcon,
  ScreenShareOffIcon,
  VideoIcon,
  VideoOffIcon,
} from "lucide-react";
import { useGroupCallStore } from "../../store/useGroupCallStore";
import { useGroupStore } from "../../store/useGroupStore";
import { useAuthStore } from "../../store/useAuthStore";
import { getInitials } from "../../hooks/useSelectedConversation";
import { canShareScreen } from "../../lib/screenShare";

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

// Plays one remote participant's audio. Kept separate from the visual
// tiles on purpose: a tile's <video> comes and goes (camera off, audio
// call, someone starting/stopping a screen share, a presenter being
// moved to the main stage) and audio must never cut out with it.
function RemoteAudio({ stream }) {
  const audioRef = useRef(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !stream) return;

    el.srcObject = stream;
    // Chrome sometimes requires play() after attaching srcObject
    el.play().catch((err) => console.log("Audio autoplay blocked:", err));
  }, [stream]);

  return <audio ref={audioRef} autoPlay />;
}

function CallTile({
  stream,
  name,
  avatarUrl,
  isVideo,
  muted,
  cameraOff,
  isLocal,
  connectionState,
  speaking,
  sharingScreen = false,
  // Main-stage tile: shows the presenter's screen, letterboxed rather
  // than cropped so nothing on it gets cut off.
  stage = false,
  // Thumbnail of a presenter whose stream is currently their screen
  // (shown on the stage instead): show their avatar, not a second copy.
  forceAvatar = false,
  onSelect,
  className = "aspect-video w-full",
}) {
  const videoRef = useRef(null);

  const showVideo = !!stream && !forceAvatar && (stage || (isVideo && !cameraOff));

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, showVideo]);

  // A muted participant can't be the one making noise, whatever the
  // analyser thinks it heard (e.g. bleed from other tiles' speakers).
  const showSpeakingRing = speaking && !muted;

  const Wrapper = onSelect ? "button" : "div";

  return (
    <Wrapper
      type={onSelect ? "button" : undefined}
      onClick={onSelect}
      aria-label={onSelect ? `View ${name}'s screen` : undefined}
      className={`relative flex items-center justify-center overflow-hidden rounded-2xl border bg-gradient-to-br from-[#1a2033] to-[#0e1220] transition-shadow ${className} ${
        showSpeakingRing ? "border-emerald-400/70 shadow-[0_0_0_3px_rgba(52,211,153,0.25)]" : "border-white/10"
      } ${onSelect ? "cursor-pointer hover:border-white/40" : ""}`}
    >
      {showVideo ? (
        // Always muted: remote audio is played by <RemoteAudio>, and we
        // never want to hear ourselves.
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full ${stage ? "bg-black object-contain" : "object-cover"}`}
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

      <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 backdrop-blur-sm">
        {muted ? <MicOffIcon className="size-3.5 shrink-0 text-red-400" /> : null}
        {isVideo && cameraOff && !stage ? <VideoOffIcon className="size-3.5 shrink-0 text-gray-300" /> : null}
        {sharingScreen ? <ScreenShareIcon className="size-3.5 shrink-0 text-[#8b98ff]" aria-hidden /> : null}
        <span className="truncate text-xs font-medium text-white">
          {isLocal ? "You" : name}
          {stage ? " · presenting" : ""}
        </span>
      </div>
    </Wrapper>
  );
}

function CallControlButton({ onPress, active, tone = "danger", label, children }) {
  const activeClass = tone === "accent" ? "bg-[#5b6dfa] text-white" : "bg-red-500 text-white";

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        isIconOnly
        onPress={onPress}
        aria-label={label}
        className={`h-12 w-12 rounded-full backdrop-blur-md ${
          active ? activeClass : "bg-white/10 text-white hover:bg-white/20"
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
  const localSharingScreen = useGroupCallStore((state) => state.localSharingScreen);
  const peers = useGroupCallStore((state) => state.peers);
  const toggleMute = useGroupCallStore((state) => state.toggleMute);
  const toggleCamera = useGroupCallStore((state) => state.toggleCamera);
  const startScreenShare = useGroupCallStore((state) => state.startScreenShare);
  const stopScreenShare = useGroupCallStore((state) => state.stopScreenShare);
  const leaveCall = useGroupCallStore((state) => state.leaveCall);

  const groups = useGroupStore((state) => state.groups);
  const authUser = useAuthStore((state) => state.authUser);

  const [duration, setDuration] = useState(0);
  // Which presenter the viewer chose to watch when more than one person
  // is sharing at once. Ignored once that person stops presenting.
  const [pinnedId, setPinnedId] = useState(null);

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

  // Somebody else's screen is the thing everyone wants to look at, so
  // it gets the big "main stage" and everyone else drops to thumbnails.
  // Our own screen never goes on our own stage — it's the window we're
  // already looking at, so it'd just be an infinite mirror.
  const presenters = peerEntries.filter(([, peer]) => peer.sharingScreen);
  const stageEntry =
    presenters.find(([userId]) => userId === pinnedId) || presenters[0] || null;
  const stageUserId = stageEntry?.[0] ?? null;

  const isVideoCall = callType === "video";

  const peerTileProps = (userId, peer) => {
    const member = membersById.get(userId);
    return {
      stream: peer.stream,
      name: member?.fullName || "Member",
      avatarUrl: member?.profilePic,
      isVideo: isVideoCall,
      muted: peer.muted,
      cameraOff: peer.cameraOff,
      speaking: peer.speaking,
      connectionState: peer.connectionState,
      sharingScreen: peer.sharingScreen,
    };
  };

  const localTile = (extra = {}) => (
    <CallTile
      stream={localStream}
      name={authUser?.fullName}
      avatarUrl={authUser?.profilePic}
      isVideo={isVideoCall}
      muted={localMuted}
      cameraOff={localCameraOff}
      speaking={localSpeaking}
      sharingScreen={localSharingScreen}
      isLocal
      {...extra}
    />
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#080b14] p-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[#5b6dfa]/20 blur-[120px]" />
        <div className="absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-[#22c3a6]/15 blur-[120px]" />
      </div>

      {/* Remote audio is played here, independent of which tiles are showing video. */}
      {peerEntries.map(([userId, peer]) =>
        peer.stream ? <RemoteAudio key={userId} stream={peer.stream} /> : null
      )}

      <div className="relative z-10 mb-4 mt-1 flex items-center justify-between gap-2 px-1 sm:px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar className="h-9 w-9 shrink-0 ring-2 ring-white/10">
            <Avatar.Image src={group?.groupPic} alt={groupName} />
            <Avatar.Fallback className="text-sm">{getInitials(groupName || "?")}</Avatar.Fallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-white">
              {groupName || "Group call"}
            </p>
            <p className="text-xs text-white/50">{tileCount} on the call</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {localSharingScreen ? (
            <div className="flex items-center gap-1.5 rounded-full bg-[#5b6dfa]/80 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">
              <ScreenShareIcon className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">You're presenting</span>
              <span className="sm:hidden">Presenting</span>
            </div>
          ) : null}

          <div className="flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5 backdrop-blur-md">
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
      </div>

      {stageEntry ? (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
          <div className="min-h-0 flex-1">
            <CallTile
              {...peerTileProps(stageEntry[0], stageEntry[1])}
              stage
              className="h-full w-full"
            />
          </div>

          <div className="flex shrink-0 gap-3 overflow-x-auto md:w-52 md:flex-col md:overflow-y-auto md:overflow-x-hidden">
            {localTile({ className: "aspect-video w-36 shrink-0 md:w-full" })}

            {peerEntries
              .filter(([userId]) => userId !== stageUserId)
              .map(([userId, peer]) => (
                <CallTile
                  key={userId}
                  {...peerTileProps(userId, peer)}
                  // Another presenter: their stream is a screen, so show
                  // their avatar and let a click bring them to the stage.
                  forceAvatar={peer.sharingScreen}
                  onSelect={peer.sharingScreen ? () => setPinnedId(userId) : undefined}
                  className="aspect-video w-36 shrink-0 md:w-full"
                />
              ))}
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex flex-1 items-center justify-center overflow-y-auto">
          <div className={`grid w-full max-w-4xl gap-3 ${gridColsClass(tileCount)}`}>
            {localTile()}

            {peerEntries.map(([userId, peer]) => (
              <CallTile key={userId} {...peerTileProps(userId, peer)} />
            ))}
          </div>
        </div>
      )}

      <div className="relative z-10 mb-6 mt-6 flex items-center justify-center gap-4 sm:gap-6">
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

        {status === "in-call" && canShareScreen() ? (
          <CallControlButton
            onPress={localSharingScreen ? stopScreenShare : startScreenShare}
            active={localSharingScreen}
            tone="accent"
            label={localSharingScreen ? "Stop sharing" : "Share screen"}
          >
            {localSharingScreen ? (
              <ScreenShareOffIcon className="size-5" />
            ) : (
              <ScreenShareIcon className="size-5" />
            )}
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
