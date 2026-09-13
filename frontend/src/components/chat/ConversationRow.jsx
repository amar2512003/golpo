import { Avatar } from "@heroui/react";
import { PhoneIcon, VideoIcon } from "lucide-react";
import { AvatarWithOnlineIndicator } from "./AvatarWithOnlineIndicator";

export function ConversationRow({ user, selected, onSelect }) {
  const showOnlineIndicator = user.showOnlineIndicator ?? true;
  const liveCall = user.liveCall;

  const avatar = (
    <Avatar className="size-12 shrink-0">
      <Avatar.Image alt={user.name} src={user.avatarUrl} />
      <Avatar.Fallback className="text-sm font-medium">{user.initials}</Avatar.Fallback>
    </Avatar>
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left ${
        selected ? "bg-accent-soft" : ""
      }`}
    >
      {showOnlineIndicator ? (
        <AvatarWithOnlineIndicator isOnline={user.isOnline ?? true}>{avatar}</AvatarWithOnlineIndicator>
      ) : (
        avatar
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{user.name}</p>
        {liveCall ? (
          <p className="flex items-center gap-1 truncate text-xs font-medium text-green-600">
            <span className="relative flex size-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-green-500" />
            </span>
            {liveCall.callType === "audio" ? (
              <PhoneIcon className="size-3 shrink-0" aria-hidden />
            ) : (
              <VideoIcon className="size-3 shrink-0" aria-hidden />
            )}
            Call live
          </p>
        ) : user.subtitle ? (
          <p className="truncate text-xs text-muted">{user.subtitle}</p>
        ) : null}
      </div>
    </button>
  );
}
