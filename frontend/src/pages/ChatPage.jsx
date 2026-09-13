import { useWallpaper } from "../context/wallpaper";
import { useChatStore } from "../store/useChatStore";
import { useGroupStore } from "../store/useGroupStore";
import { useSelectedConversation } from "../hooks/useSelectedConversation";
import { useEffect } from "react";
import ChatSidebar from "../components/chat/ChatSidebar";
import { ChatHeader } from "../components/chat/ChatHeader";
import { MessageList } from "../components/chat/MessageList";
import { ChatComposer } from "../components/chat/ChatComposer";
import { VideoCallModal } from "../components/chat/VideoCallModal";
import { GroupCallModal } from "../components/chat/GroupCallModal";

function ChatPage() {
  const { frameStyle } = useWallpaper();

  const getConversations = useChatStore((state) => state.getConversations);
  const getMessages = useChatStore((state) => state.getMessages);
  const getUsers = useChatStore((state) => state.getUsers);
  const subscribeToMessages = useChatStore((state) => state.subscribeToMessages);
  const unsubscribeFromMessages = useChatStore((state) => state.unsubscribeFromMessages);

  const getGroups = useGroupStore((state) => state.getGroups);
  const getGroupMessages = useGroupStore((state) => state.getGroupMessages);
  const subscribeToGroupMessages = useGroupStore((state) => state.subscribeToGroupMessages);
  const unsubscribeFromGroupMessages = useGroupStore((state) => state.unsubscribeFromGroupMessages);
  const subscribeToGroupEvents = useGroupStore((state) => state.subscribeToGroupEvents);
  const unsubscribeFromGroupEvents = useGroupStore((state) => state.unsubscribeFromGroupEvents);
  const activeGroupId = useGroupStore((state) => state.activeGroupId);

  const { activeConversation, activeConversationId, activeConversationType, isLargeScreen } =
    useSelectedConversation();

  useEffect(() => {
    getUsers();
    getConversations();
    getGroups();
  }, [getConversations, getUsers, getGroups]);

  // Roster/membership events (create/update/delete/removed/left) apply no
  // matter which thread is open, so this subscribes once per session.
  useEffect(() => {
    subscribeToGroupEvents();
    return () => unsubscribeFromGroupEvents();
  }, [subscribeToGroupEvents, unsubscribeFromGroupEvents]);

  useEffect(() => {
    if (!activeConversationId || activeConversationType !== "dm") return;

    getMessages(activeConversationId);
    subscribeToMessages(activeConversationId);

    // cleanup
    return () => unsubscribeFromMessages();
  }, [getMessages, activeConversationId, activeConversationType, subscribeToMessages, unsubscribeFromMessages]);

  useEffect(() => {
    if (!activeGroupId) return;

    getGroupMessages(activeGroupId);
    subscribeToGroupMessages(activeGroupId);

    return () => unsubscribeFromGroupMessages();
  }, [activeGroupId, getGroupMessages, subscribeToGroupMessages, unsubscribeFromGroupMessages]);

  return (
    <>
      <div
        className="flex h-dvh flex-col overflow-hidden p-2 sm:p-3 md:p-8"
        style={frameStyle}
      >
        <div className="mx-auto flex w-full max-w-6xl flex-1 overflow-hidden rounded-2xl border border-border bg-background text-foreground">
          <ChatSidebar />

          <div
            className={`flex-1 flex-col overflow-hidden ${
              !isLargeScreen && !activeConversationId ? "hidden lg:flex" : "flex"
            }`}
          >
            <ChatHeader />
            <MessageList />

            {activeConversation ? <ChatComposer /> : null}
          </div>
        </div>
      </div>

      <VideoCallModal />
      <GroupCallModal />
    </>
  );
}

export default ChatPage;
