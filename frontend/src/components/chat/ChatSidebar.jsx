import { useState } from "react";
import { getInitials, useSelectedConversation } from "../../hooks/useSelectedConversation";
import { formatLastMessagePreview, formatSidebarTime } from "../../lib/utils";
import { useAuthStore } from "../../store/useAuthStore";
import { useChatStore } from "../../store/useChatStore";
import { useGroupStore } from "../../store/useGroupStore";
import { useStatusStore } from "../../store/useStatusStore";
import { APP_NAME, AppLogo } from "../AppLogo";
import { UserButton } from "@clerk/react";

import { Button, SearchField, Tabs } from "@heroui/react";
import { CircleDashedIcon, MessageSquareIcon, PlusIcon, UsersIcon, Users2Icon } from "lucide-react";
import { ConversationRow } from "./ConversationRow";
import { CreateGroupModal } from "./CreateGroupModal";
import { StatusPanel } from "./StatusPanel";
import { UserSearchPanel } from "./UserSearchPanel";

// Builds the row's subtitle: "You: <preview>" when I sent the last
// message, otherwise just the preview. Falls back to the given default
// (member count for a group with no messages yet) once there's nothing
// to preview at all.
function buildSubtitle({ lastMessage, authUserId, fallback }) {
  const preview = formatLastMessagePreview(lastMessage);
  if (!preview) return fallback;
  const isMine = lastMessage?.senderId && String(lastMessage.senderId) === String(authUserId);
  return isMine ? `You: ${preview}` : preview;
}

function mapUserForList(user, onlineUsers, authUserId, statusByUserId) {
  const status = statusByUserId.get(String(user._id));
  return {
    conversationId: user._id,
    hasStatus: Boolean(status),
    hasUnseenStatus: Boolean(status?.hasUnseen),
    kind: "dm",
    lastActivityAt: user.lastMessageAt,
    id: user._id,
    name: user.fullName,
    avatarUrl: user.profilePic,
    initials: getInitials(user.fullName),
    isOnline: onlineUsers.includes(user._id),
    subtitle: buildSubtitle({ lastMessage: user.lastMessage, authUserId, fallback: "" }),
    isSubtitleUnread: Boolean(user.unreadCount),
    unreadCount: user.unreadCount || 0,
    timestamp: formatSidebarTime(user.lastMessageAt),
    peer: {
      name: user.fullName,
      avatarUrl: user.profilePic,
      initials: getInitials(user.fullName),
      isOnline: onlineUsers.includes(user._id),
    },
  };
}

function mapGroupForList(group, liveCall, authUserId) {
  const memberCount = group.members?.length || 0;
  const memberCountLabel = `${memberCount} member${memberCount === 1 ? "" : "s"}`;
  return {
    id: group._id,
    kind: "group",
    lastActivityAt: group.lastMessageAt ?? group.createdAt,
    name: group.name,
    avatarUrl: group.groupPic,
    initials: getInitials(group.name),
    subtitle: buildSubtitle({
      lastMessage: group.lastMessage,
      authUserId,
      fallback: memberCountLabel,
    }),
    isSubtitleUnread: Boolean(group.unreadCount),
    unreadCount: group.unreadCount || 0,
    timestamp: formatSidebarTime(group.lastMessageAt ?? group.createdAt),
    showOnlineIndicator: false,
    liveCall,
  };
}

function ChatSidebar() {
  const conversations = useChatStore((state) => state.conversations);

  const searchQuery = useChatStore((state) => state.searchQuery);
  const setSearchQuery = useChatStore((state) => state.setSearchQuery);

  const sidebarTab = useChatStore((state) => state.sidebarTab);
  const setSidebarTab = useChatStore((state) => state.setSidebarTab);

  const setActiveConversationId = useChatStore((state) => state.setActiveConversationId);

  const groups = useGroupStore((state) => state.groups);
  const setActiveGroupId = useGroupStore((state) => state.setActiveGroupId);
  const activeGroupCalls = useGroupStore((state) => state.activeGroupCalls);

  const others = useStatusStore((state) => state.others);
  const hasUnseenStatuses = others.some((bucket) => bucket.hasUnseen);
  const openStatusViewer = useStatusStore((state) => state.openStatusViewer);

  const onlineUsers = useAuthStore((state) => state.onlineUsers);
  const authUserId = useAuthStore((state) => state.authUser?._id);

  const { activeConversationId, activeConversationType, isLargeScreen } = useSelectedConversation();

  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  // Lookup so each DM row can tell whether that person has a live status
  // (and whether I've watched it) without scanning the tray per row.
  const statusByUserId = new Map(others.map((bucket) => [String(bucket.userId), bucket]));

  const conversationUsers = conversations.map((user) =>
    mapUserForList(user, onlineUsers, authUserId, statusByUserId),
  );
  const groupItems = groups.map((group) =>
    mapGroupForList(group, activeGroupCalls[group._id], authUserId),
  );

  // The Chats tab is one list: DMs and groups together, newest activity first.
  const getActivityTime = (item) => (item.lastActivityAt ? new Date(item.lastActivityAt).getTime() : 0);
  const allChats = [...conversationUsers, ...groupItems].sort(
    (a, b) => getActivityTime(b) - getActivityTime(a),
  );

  const filteredChats = normalizedSearchQuery
    ? allChats.filter((chat) => chat.name.toLowerCase().includes(normalizedSearchQuery))
    : allChats;

  const filteredGroups = normalizedSearchQuery
    ? groupItems.filter((group) => group.name.toLowerCase().includes(normalizedSearchQuery))
    : groupItems;

  return (
    <aside
      className={`chat-sidebar min-h-0 w-full shrink-0 flex-col overflow-hidden border-r border-border lg:w-72 ${
        !isLargeScreen && activeConversationId ? "hidden lg:flex" : "flex"
      }`}
    >
      <div className="shrink-0 border-b border-border px-2 pb-2 pt-2.5 sm:px-3 sm:pt-3">
        <div className="flex items-center gap-2 px-0.5 sm:gap-2.5 sm:px-1">
          <AppLogo size={32} className="size-8 shrink-0 rounded-[9px] sm:size-8.5" alt="" />
          <p className="flex-1 truncate text-lg font-bold tracking-tight sm:text-[22px]">
            {APP_NAME}
            <span className="brand-tagline">More than just chats</span>
          </p>
          <UserButton
            appearance={{
              elements: {
                avatarBox: "size-8",
              },
            }}
          />
        </div>
      </div>

      <Tabs
        selectedKey={sidebarTab}
        onSelectionChange={(key) => setSidebarTab(String(key))}
        variant="secondary"
        className="sidebar-tabs flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {/* Filters the Chats/Groups lists. The Users tab has its own email
            search inside the panel, and the Status tray is a short list
            of its own, so this bar would do nothing on either. */}
        {sidebarTab !== "users" && sidebarTab !== "status" ? (
          <div className="sidebar-search shrink-0 border-b border-border px-3 pb-2 pt-2">
            <SearchField
              fullWidth
              variant="secondary"
              className="w-full"
              value={searchQuery}
              onChange={setSearchQuery}
            >
              <SearchField.Group className="rounded-xl">
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="Search" />
                {searchQuery ? <SearchField.ClearButton /> : null}
              </SearchField.Group>
            </SearchField>
          </div>
        ) : null}

        <Tabs.ListContainer className="sidebar-navigation shrink-0 border-b border-border px-2 pb-2 pt-1">
          <Tabs.List className="w-full gap-0.5">
            <Tabs.Tab id="chats" className="flex-1 justify-center gap-1.5">
              <MessageSquareIcon className="size-3.5 opacity-80" aria-hidden />
              Chats
            </Tabs.Tab>
            <Tabs.Tab id="groups" className="flex-1 justify-center gap-1.5">
              <Users2Icon className="size-3.5 opacity-80" aria-hidden />
              Groups
            </Tabs.Tab>
            <Tabs.Tab id="status" className="flex-1 justify-center gap-1.5">
              <span className="relative flex items-center">
                <CircleDashedIcon className="size-3.5 opacity-80" aria-hidden />
                {/* A dot on the tab itself, so an unseen status is
                    noticeable even while you're looking at another tab. */}
                {hasUnseenStatuses ? (
                  <span className="status-tab-dot absolute -right-1 -top-1 size-1.5 rounded-full" />
                ) : null}
              </span>
              Status
            </Tabs.Tab>
            <Tabs.Tab id="users" className="flex-1 justify-center gap-1.5">
              <UsersIcon className="size-3.5 opacity-80" aria-hidden />
              Users
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel
          id="chats"
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto outline-none"
        >
          {filteredChats.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">
              No conversations match your search.
            </p>
          ) : (
            filteredChats.map((chat) =>
              chat.kind === "group" ? (
                <ConversationRow
                  key={`group:${chat.id}`}
                  user={chat}
                  selected={
                    activeConversationType === "group" && chat.id === activeConversationId
                  }
                  onSelect={() => setActiveGroupId(chat.id)}
                />
              ) : (
                <ConversationRow
                  key={`dm:${chat.id}`}
                  user={chat}
                  selected={activeConversationType === "dm" && chat.id === activeConversationId}
                  onSelect={() => setActiveConversationId(chat.id)}
                  onOpenStatus={chat.hasStatus ? () => openStatusViewer(chat.id) : undefined}
                />
              ),
            )
          )}
        </Tabs.Panel>

        <Tabs.Panel id="groups" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto outline-none">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Your groups</p>
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              aria-label="Create group"
              onPress={() => setIsCreateGroupOpen(true)}
            >
              <PlusIcon className="size-4" />
            </Button>
          </div>

          {filteredGroups.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">
              No groups yet. Create one to get started.
            </p>
          ) : (
            filteredGroups.map((group) => (
              <ConversationRow
                key={group.id}
                user={group}
                selected={activeConversationType === "group" && group.id === activeConversationId}
                onSelect={() => setActiveGroupId(group.id)}
              />
            ))
          )}
        </Tabs.Panel>

        <Tabs.Panel
          id="status"
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto outline-none"
        >
          <StatusPanel />
        </Tabs.Panel>

        <Tabs.Panel id="users" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto outline-none">
          <UserSearchPanel onOpenConversation={setActiveConversationId} />
        </Tabs.Panel>
      </Tabs>

      {isCreateGroupOpen ? (
        <CreateGroupModal onClose={() => setIsCreateGroupOpen(false)} />
      ) : null}
    </aside>
  );
}
export default ChatSidebar;
