import { useChatStore } from "../store/useChatStore";
import { useGroupStore } from "../store/useGroupStore";
import { useTypingStore } from "../store/useTypingStore";
import { useSelectedConversation } from "../hooks/useSelectedConversation";
import { useEffect } from "react";
import ChatSidebar from "../components/chat/ChatSidebar";
import { ChatHeader } from "../components/chat/ChatHeader";
import { MessageList } from "../components/chat/MessageList";
import { ChatComposer } from "../components/chat/ChatComposer";
import { VideoCallModal } from "../components/chat/VideoCallModal";
import { GroupCallModal } from "../components/chat/GroupCallModal";
import { GroupCallBanner } from "../components/chat/GroupCallBanner";

function ChatPage() {
  const getConversations = useChatStore((state) => state.getConversations);
  const getMessages = useChatStore((state) => state.getMessages);
  const subscribeToMessages = useChatStore((state) => state.subscribeToMessages);
  const unsubscribeFromMessages = useChatStore((state) => state.unsubscribeFromMessages);

  const getGroups = useGroupStore((state) => state.getGroups);
  const getGroupMessages = useGroupStore((state) => state.getGroupMessages);
  const subscribeToGroupMessages = useGroupStore((state) => state.subscribeToGroupMessages);
  const unsubscribeFromGroupMessages = useGroupStore((state) => state.unsubscribeFromGroupMessages);
  const subscribeToGroupEvents = useGroupStore((state) => state.subscribeToGroupEvents);
  const unsubscribeFromGroupEvents = useGroupStore((state) => state.unsubscribeFromGroupEvents);
  const activeGroupId = useGroupStore((state) => state.activeGroupId);
  const subscribeToTyping = useTypingStore((state) => state.subscribeToTyping);
  const unsubscribeFromTyping = useTypingStore((state) => state.unsubscribeFromTyping);

  const { activeConversation, activeConversationId, activeConversationType, isLargeScreen } =
    useSelectedConversation();

  useEffect(() => {
    getConversations();
    getGroups();
  }, [getConversations, getGroups]);

  // Roster/membership events (create/update/delete/removed/left) apply no
  // matter which thread is open, so this subscribes once per session.
  useEffect(() => {
    subscribeToGroupEvents();
    return () => unsubscribeFromGroupEvents();
  }, [subscribeToGroupEvents, unsubscribeFromGroupEvents]);

  // Typing state is tracked for every chat (not just the open one) so it's
  // already correct the moment you switch to a chat someone is typing in.
  useEffect(() => {
    subscribeToTyping();
    return () => unsubscribeFromTyping();
  }, [subscribeToTyping, unsubscribeFromTyping]);

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
      <div className="chat-page flex h-dvh flex-col overflow-hidden p-2 sm:p-3 md:p-8">
        <div className="chat-shell mx-auto flex min-h-0 w-full max-w-6xl flex-1 overflow-hidden rounded-2xl border border-border bg-background text-foreground">
          <ChatSidebar />

          <div
            className={`chat-thread min-h-0 flex-1 flex-col overflow-hidden ${
              !isLargeScreen && !activeConversationId ? "hidden lg:flex" : "flex"
            }`}
          >
            <ChatHeader />
            <GroupCallBanner />
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
