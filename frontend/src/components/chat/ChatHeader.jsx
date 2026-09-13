import { useState, useEffect } from "react";
import { Avatar, Button } from "@heroui/react";
import {
  ChevronLeftIcon,
  Maximize2Icon,
  PhoneIcon,
  VideoIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from "lucide-react";
import { AppLogo } from "../AppLogo";
import { AvatarWithOnlineIndicator } from "./AvatarWithOnlineIndicator";
import { GroupInfoModal } from "./GroupInfoModal";

import { ThemeToggle } from "../ThemeToggle";

import { useChatStore } from "../../store/useChatStore";
import { useGroupStore } from "../../store/useGroupStore";
import { useCallStore } from "../../store/useCallStore";
import { useGroupCallStore } from "../../store/useGroupCallStore";
import { useSelectedConversation } from "../../hooks/useSelectedConversation";

function getFullscreenElement() {
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement ||
    null
  );
}

function requestFullscreen(el) {
  if (el.requestFullscreen) return el.requestFullscreen();
  if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
  if (el.mozRequestFullScreen) return el.mozRequestFullScreen();
  if (el.msRequestFullscreen) return el.msRequestFullscreen();
  return Promise.reject(new Error("Fullscreen API not supported"));
}

function exitFullscreen() {
  if (document.exitFullscreen) return document.exitFullscreen();
  if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
  if (document.mozCancelFullScreen) return document.mozCancelFullScreen();
  if (document.msExitFullscreen) return document.msExitFullscreen();
  return Promise.resolve();
}

export function ChatHeader() {
  const isSoundEnabled = useChatStore((state) => state.isSoundEnabled);
  const setActiveConversationId = useChatStore((state) => state.setActiveConversationId);
  const setSoundEnabled = useChatStore((state) => state.setSoundEnabled);
  const clearActiveGroup = useGroupStore((state) => state.clearActiveGroup);
  const startCall = useCallStore((state) => state.startCall);
  const groupCallStatus = useGroupCallStore((state) => state.status);
  const activeGroupCallId = useGroupCallStore((state) => state.groupId);
  const joinGroupCall = useGroupCallStore((state) => state.joinCall);

  const { activeConversation, activeConversationType, isLargeScreen } = useSelectedConversation();
  const isGroup = activeConversationType === "group";

  const closeActiveThread = () => {
    setIsGroupInfoOpen(false);
    if (isGroup) clearActiveGroup();
    else setActiveConversationId(null);
  };

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!getFullscreenElement());
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!getFullscreenElement()) {
        await requestFullscreen(document.documentElement);
      } else {
        await exitFullscreen();
      }
    } catch (err) {
      // iOS Safari (regular tab) doesn't support this — silently no-op
      console.warn("Fullscreen not supported on this browser:", err.message);
    }
  };

  const handleStartCall = () => {
    if (!activeConversation) return;

    startCall(
      {
        _id: activeConversation.peer._id,
        fullName: activeConversation.peer.name,
        profilePic: activeConversation.peer.avatarUrl,
      },
      "video"
    );
  };

  const handleStartAudioCall = () => {
    if (!activeConversation) return;

    startCall(
      {
        _id: activeConversation.peer._id,
        fullName: activeConversation.peer.name,
        profilePic: activeConversation.peer.avatarUrl,
      },
      "audio"
    );
  };

  const handleJoinGroupVideoCall = () => {
    if (!activeConversation || !isGroup) return;
    joinGroupCall({ _id: activeConversation.id, name: activeConversation.peer.name }, "video");
  };

  const handleJoinGroupAudioCall = () => {
    if (!activeConversation || !isGroup) return;
    joinGroupCall({ _id: activeConversation.id, name: activeConversation.peer.name }, "audio");
  };

  return (
    <header className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-1.5 py-1.5 sm:gap-2 sm:px-2 sm:py-2">
      {activeConversation && !isLargeScreen ? (
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          className="shrink-0"
          onPress={closeActiveThread}
        >
          <ChevronLeftIcon className="size-6" strokeWidth={2.25} />
        </Button>
      ) : null}

      {activeConversation ? (
        <>
          <button
            type="button"
            disabled={!isGroup}
            onClick={() => isGroup && setIsGroupInfoOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left sm:flex-initial"
            aria-label={isGroup ? "View group info" : undefined}
          >
            <AvatarWithOnlineIndicator isOnline={activeConversation.peer.isOnline ?? true}>
              <Avatar className="size-9 shrink-0">
                <Avatar.Image
                  alt={activeConversation.peer.name}
                  src={activeConversation.peer.avatarUrl}
                />
                <Avatar.Fallback className="text-sm font-medium">
                  {activeConversation.peer.initials}
                </Avatar.Fallback>
              </Avatar>
            </AvatarWithOnlineIndicator>

            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="truncate text-[15px] font-semibold leading-tight">
                {activeConversation.peer.name}
              </p>
              <p className="truncate text-xs text-muted">
                {isGroup ? (
                  activeConversation.peer.subtitle
                ) : activeConversation.peer.isOnline ? (
                  <span className="font-medium text-success">Online</span>
                ) : (
                  "Offline"
                )}
              </p>
            </div>
          </button>

          {isGroup && isGroupInfoOpen ? (
            <GroupInfoModal
              groupId={activeConversation.id}
              onClose={() => setIsGroupInfoOpen(false)}
            />
          ) : null}
        </>
      ) : (
        <div className="flex flex-1 items-center gap-2.5 sm:text-left">
          <AppLogo size={36} className="rounded-[9px]" />
          <div className="flex-1 text-center sm:text-left">
            <p className="truncate text-[13px] font-medium text-muted">
              Select a conversation
            </p>
          </div>
        </div>
      )}

      <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-0.5 sm:gap-1">
        <ThemeToggle />

        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          className="shrink-0"
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          onPress={toggleFullscreen}
        >
          {isFullscreen ? (
            <XIcon className="size-5.5 text-red-500" strokeWidth={2.5} aria-hidden />
          ) : (
            <Maximize2Icon className="size-5.5" strokeWidth={2} aria-hidden />
          )}
        </Button>

        {activeConversation && !isGroup ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              className="shrink-0"
              aria-label="Start audio call"
              onPress={handleStartAudioCall}
            >
              <PhoneIcon className="size-5.5" strokeWidth={2} aria-hidden />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              className="shrink-0"
              aria-label="Start video call"
              onPress={handleStartCall}
            >
              <VideoIcon className="size-5.5" strokeWidth={2} aria-hidden />
            </Button>
          </>
        ) : null}

        {activeConversation && isGroup ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              className="shrink-0"
              aria-label="Start or join group audio call"
              isDisabled={groupCallStatus !== "idle" && activeGroupCallId !== activeConversation.id}
              onPress={handleJoinGroupAudioCall}
            >
              <PhoneIcon className="size-5.5" strokeWidth={2} aria-hidden />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              className="shrink-0"
              aria-label="Start or join group video call"
              isDisabled={groupCallStatus !== "idle" && activeGroupCallId !== activeConversation.id}
              onPress={handleJoinGroupVideoCall}
            >
              <VideoIcon className="size-5.5" strokeWidth={2} aria-hidden />
            </Button>
          </>
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          className="shrink-0"
          aria-pressed={isSoundEnabled}
          onPress={() => setSoundEnabled(!isSoundEnabled)}
        >
          {isSoundEnabled ? (
            <Volume2Icon className="size-5.5" strokeWidth={2} aria-hidden />
          ) : (
            <VolumeXIcon className="size-5.5" strokeWidth={2} aria-hidden />
          )}
        </Button>

        {activeConversation ? (
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            className="shrink-0"
            aria-label="Close chat"
            onPress={closeActiveThread}
          >
            <XIcon className="size-5.5" strokeWidth={2} aria-hidden />
          </Button>
        ) : null}
      </div>
    </header>
  );
}