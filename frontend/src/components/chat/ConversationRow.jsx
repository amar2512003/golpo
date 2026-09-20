import { Avatar } from "@heroui/react";
import { PhoneIcon, VideoIcon } from "lucide-react";
import { AvatarWithOnlineIndicator } from "./AvatarWithOnlineIndicator";
import { StatusRing } from "./StatusRing";

export function ConversationRow({ user, selected, onSelect, onOpenStatus }) {
  const showOnlineIndicator = user.showOnlineIndicator ?? true;
  const liveCall = user.liveCall;
  const unreadCount = user.unreadCount || 0;
  const hasUnread = unreadCount > 0;

  const avatarImage = (
    <Avatar className="size-12 shrink-0">
      <Avatar.Image alt={user.name} src={user.avatarUrl} />
      <Avatar.Fallback className="text-sm font-medium">{user.initials}</Avatar.Fallback>
    </Avatar>
  );

  // A live status puts a ring around this person's avatar — glowing
  // orange while any of it is still unseen, flat grey once it's watched.
  // When there's a status to show, the avatar becomes its own real
  // button that jumps straight into the reel; stopPropagation keeps that
  // tap from also triggering the row's onSelect underneath it. With no
  // status, the ring renders nothing and the avatar is just decoration —
  // tapping it opens the chat like the rest of the row.
  const avatarWithRing = user.hasStatus ? (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpenStatus?.();
      }}
      className="block shrink-0 cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0"
      aria-label={`View ${user.name}'s status`}
    >
      <StatusRing hasStatus={user.hasStatus} hasUnseen={user.hasUnseenStatus}>
        {avatarImage}
      </StatusRing>
    </button>
  ) : (
    <StatusRing hasStatus={user.hasStatus} hasUnseen={user.hasUnseenStatus}>
      {avatarImage}
    </StatusRing>
  );

  const avatar = showOnlineIndicator ? (
    <AvatarWithOnlineIndicator isOnline={user.isOnline ?? true}>
      {avatarWithRing}
    </AvatarWithOnlineIndicator>
  ) : (
    avatarWithRing
  );

  // A plain <button> can't contain another button (the avatar, when it
  // doubles as "open this status"), so the row itself is a div acting as
  // a button — same click/keyboard behavior, just able to hold a real
  // nested control.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect();
      }}
      className={`conversation-row flex w-full cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 text-left ${
        selected ? "bg-accent-soft" : ""
      }`}
    >
      {avatar}

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
    </div>
  );
}
