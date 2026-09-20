import { Avatar } from "@heroui/react";
import { PhoneIcon, VideoIcon } from "lucide-react";
import { AvatarWithOnlineIndicator } from "./AvatarWithOnlineIndicator";

export function ConversationRow({ user, selected, onSelect }) {
  const showOnlineIndicator = user.showOnlineIndicator ?? true;
  const liveCall = user.liveCall;
  const unreadCount = user.unreadCount || 0;
  const hasUnread = unreadCount > 0;

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
      className={`conversation-row flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left ${
        selected ? "bg-accent-soft" : ""
      }`}
    >
      {showOnlineIndicator ? (
        <AvatarWithOnlineIndicator isOnline={user.isOnline ?? true}>{avatar}</AvatarWithOnlineIndicator>
      ) : (
        avatar
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={`truncate text-[15px] ${hasUnread ? "font-bold" : "font-semibold"}`}
          >
            {user.name}
          </p>
          {user.timestamp ? (
            <span
              className={`ml-auto shrink-0 text-[11px] ${
                hasUnread ? "font-semibold text-accent" : "text-muted"
              }`}
            >
              {user.timestamp}
            </span>
          ) : null}
        </div>

        <div className="mt-0.5 flex items-center gap-2">
          {liveCall ? (
            <p className="flex min-w-0 flex-1 items-center gap-1 truncate text-xs font-medium text-green-600">
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
            <p
              className={`min-w-0 flex-1 truncate text-xs ${
                hasUnread ? "font-medium text-foreground" : "text-muted"
              }`}
            >
              {user.subtitle}
            </p>
          ) : (
            <span className="flex-1" />
          )}

          {hasUnread ? (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
