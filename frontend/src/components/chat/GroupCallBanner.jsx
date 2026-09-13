import { Button } from "@heroui/react";
import { PhoneIcon, VideoIcon } from "lucide-react";
import { useGroupCallStore } from "../../store/useGroupCallStore";
import { useGroupStore } from "../../store/useGroupStore";
import { useSelectedConversation } from "../../hooks/useSelectedConversation";

// Shown at the top of a group chat while a call is live for that group.
// Without this, anyone who wasn't already looking at the chat when the
// call started has no way to know it's happening — the "start/join call"
// buttons in the header look identical whether or not a call is live.
export function GroupCallBanner() {
  const { activeConversation, activeConversationType } = useSelectedConversation();
  const isGroup = activeConversationType === "group";

  const activeGroupCalls = useGroupStore((state) => state.activeGroupCalls);
  const joinCall = useGroupCallStore((state) => state.joinCall);
  const ownCallStatus = useGroupCallStore((state) => state.status);
  const ownCallGroupId = useGroupCallStore((state) => state.groupId);

  if (!isGroup || !activeConversation) return null;

  const liveCall = activeGroupCalls[activeConversation.id];
  if (!liveCall) return null;

  // Already on this call (or the modal for it is up) — the call UI
  // itself covers this, no need to also show a "join" banner.
  const alreadyOnThisCall = ownCallStatus !== "idle" && String(ownCallGroupId) === String(activeConversation.id);
  if (alreadyOnThisCall) return null;

  const isVideo = liveCall.callType !== "audio";

  const handleJoin = () => {
    joinCall({ _id: activeConversation.id, name: activeConversation.peer.name }, liveCall.callType || "video");
  };

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-green-500/10 px-3 py-2 sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className="relative flex size-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
          <span className="relative inline-flex size-2.5 rounded-full bg-green-500" />
        </span>

        {isVideo ? (
          <VideoIcon className="size-4 shrink-0 text-green-600" strokeWidth={2} aria-hidden />
        ) : (
          <PhoneIcon className="size-4 shrink-0 text-green-600" strokeWidth={2} aria-hidden />
        )}

        <p className="truncate text-sm font-medium">
          {isVideo ? "Video call is live" : "Audio call is live"}
        </p>
      </div>

      <Button size="sm" className="shrink-0 bg-green-500 text-white" onPress={handleJoin}>
        Join
      </Button>
    </div>
  );
}
