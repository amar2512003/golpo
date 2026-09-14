import { useState } from "react";
import { getInitials, useSelectedConversation } from "../../hooks/useSelectedConversation";
import { useAuthStore } from "../../store/useAuthStore";
import { useChatStore } from "../../store/useChatStore";
import { useGroupStore } from "../../store/useGroupStore";
import { APP_NAME, AppLogo } from "../AppLogo";
import { UserButton } from "@clerk/react";

import { Button, SearchField, Tabs } from "@heroui/react";
import { MessageSquareIcon, PlusIcon, UsersIcon, Users2Icon } from "lucide-react";
import { ConversationRow } from "./ConversationRow";
import { CreateGroupModal } from "./CreateGroupModal";
import { UserSearchPanel } from "./UserSearchPanel";

function mapUserForList(user, onlineUsers) {
  return {
    conversationId: user._id,
    id: user._id,
    name: user.fullName,
    avatarUrl: user.profilePic,
    initials: getInitials(user.fullName),
    isOnline: onlineUsers.includes(user._id),
    peer: {
      name: user.fullName,
      avatarUrl: user.profilePic,
      initials: getInitials(user.fullName),
      isOnline: onlineUsers.includes(user._id),
    },
  };
}

function mapGroupForList(group, liveCall) {
  const memberCount = group.members?.length || 0;
  return {
    id: group._id,
    name: group.name,
    avatarUrl: group.groupPic,
    initials: getInitials(group.name),
    subtitle: `${memberCount} member${memberCount === 1 ? "" : "s"}`,
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

  const onlineUsers = useAuthStore((state) => state.onlineUsers);

  const { activeConversationId, activeConversationType, isLargeScreen } = useSelectedConversation();

  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const conversationUsers = conversations.map((user) => mapUserForList(user, onlineUsers));
  const groupItems = groups.map((group) => mapGroupForList(group, activeGroupCalls[group._id]));

  const filteredConversations = normalizedSearchQuery
    ? conversationUsers.filter((conversation) =>
        conversation.peer.name.toLowerCase().includes(normalizedSearchQuery),
      )
    : conversationUsers;

  const filteredGroups = normalizedSearchQuery
    ? groupItems.filter((group) => group.name.toLowerCase().includes(normalizedSearchQuery))
    : groupItems;

  return (
    <aside
      className={`min-h-0 w-full shrink-0 flex-col overflow-hidden border-r border-border lg:w-72 ${
        !isLargeScreen && activeConversationId ? "hidden lg:flex" : "flex"
      }`}
    >
      <div className="shrink-0 border-b border-border px-2 pb-2 pt-2.5 sm:px-3 sm:pt-3">
        <div className="flex items-center gap-2 px-0.5 sm:gap-2.5 sm:px-1">
          <AppLogo size={32} className="size-8 shrink-0 rounded-[9px] sm:size-8.5" alt="" />
          <p className="flex-1 truncate text-lg font-bold tracking-tight sm:text-[22px]">
            {APP_NAME}
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
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <div className="shrink-0 border-b border-border px-3 pb-2 pt-2">
          <SearchField
            fullWidth
            variant="secondary"
            className="w-full"
            value={searchQuery}
            onChange={setSearchQuery}
          >
            <SearchField.Group className="rounded-xl">
              <SearchField.SearchIcon />
              <SearchField.Input
                placeholder={sidebarTab === "users" ? "Find someone by email below" : "Search"}
                disabled={sidebarTab === "users"}
              />
              {searchQuery ? <SearchField.ClearButton /> : null}
            </SearchField.Group>
          </SearchField>
        </div>

        <Tabs.ListContainer className="shrink-0 border-b border-border px-2 pb-2 pt-1">
          <Tabs.List className="w-full gap-0.5">
            <Tabs.Tab id="chats" className="flex-1 justify-center gap-1.5">
              <MessageSquareIcon className="size-3.5 opacity-80" aria-hidden />
              Chats
            </Tabs.Tab>
            <Tabs.Tab id="groups" className="flex-1 justify-center gap-1.5">
              <Users2Icon className="size-3.5 opacity-80" aria-hidden />
              Groups
            </Tabs.Tab>
            <Tabs.Tab id="users" className="flex-1 justify-center gap-1.5">
              <UsersIcon className="size-3.5 opacity-80" aria-hidden />
              Users
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel
          id="chats"
          className="flex-1 overflow-x-hidden overflow-y-auto outline-none"
        >
          {filteredConversations.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">
              No conversations match your search.
            </p>
          ) : (
            filteredConversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                user={conversation}
                selected={
                  activeConversationType === "dm" && conversation.id === activeConversationId
                }
                onSelect={() => setActiveConversationId(conversation.id)}
              />
            ))
          )}
        </Tabs.Panel>

        <Tabs.Panel id="groups" className="flex-1 overflow-x-hidden overflow-y-auto outline-none">
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

        <Tabs.Panel id="users" className="flex-1 overflow-x-hidden overflow-y-auto outline-none">
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
