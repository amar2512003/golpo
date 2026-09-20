import { useEffect } from "react";
import useScrollToBottom from "../../hooks/useScrollToBottom";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import {
  getDmTypingKey,
  getGroupTypingKey,
  useTypingStore,
} from "../../store/useTypingStore";
import { NoConversationPlaceholder } from "./NoConversationPlaceholder";
import { useSelectedConversation } from "../../hooks/useSelectedConversation";
import { useAiChatStore } from "../../store/useAiChatStore";
import { formatMessageDate, getDayKey } from "../../lib/utils";

// Splits a flat message list into contiguous same-day runs, each tagged
// with a label ("Today" / "Yesterday" / a date) to render as a separator.
function groupMessagesByDay(messages) {
  const groups = [];

  for (const message of messages) {
    const dayKey = getDayKey(message.createdAt);
    const lastGroup = groups.at(-1);

    if (lastGroup && lastGroup.dayKey === dayKey) {
      lastGroup.messages.push(message);
    } else {
      groups.push({
        dayKey,
        label: formatMessageDate(message.createdAt),
        messages: [message],
      });
    }
  }

  return groups;
}

const NO_TYPERS = [];

// "Rafi is typing" / "Rafi and Mim are typing" / "3 people are typing"
function formatTypingLabel(names) {
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  return `${names.length} people are typing`;
}

export function MessageList() {
  const { activeConversation, activeConversationId, activeConversationType } =
    useSelectedConversation();

  const lastMessageId = activeConversation?.messages.at(-1)?.id;
  const messagesScrollRef = useScrollToBottom(activeConversationId, lastMessageId);

  const isGroup = activeConversationType === "group";
  const isAi = activeConversationType === "ai";
  const typingKey = activeConversationId
    ? isGroup
      ? getGroupTypingKey(activeConversationId)
      : getDmTypingKey(activeConversationId)
    : null;
  const typingUserIds = useTypingStore((state) => state.typing[typingKey]) ?? NO_TYPERS;
  const isAiTyping = useAiChatStore((state) => state.isTyping);

  // In a DM the typer is always the peer; in a group, look up each typer's
  // first name from the member list (anyone no longer a member is skipped).
  // The AI thread has its own loading flag instead of socket typing events.
  const typingNames = isAi
    ? isAiTyping
      ? [activeConversation?.peer.name ?? "AI Assistant"]
      : []
    : isGroup
      ? typingUserIds
          .map((id) => activeConversation?.members?.find((member) => String(member._id) === id))
          .filter(Boolean)
          .map((member) => member.fullName.split(" ")[0])
      : typingUserIds.length > 0 && activeConversation
        ? [activeConversation.peer.name]
        : [];
  const isSomeoneTyping = typingNames.length > 0;

  // Bring the indicator into view when it appears — but only if the reader
  // is already near the bottom, so it never yanks them out of old messages.
  useEffect(() => {
    const scrollEl = messagesScrollRef.current;
    if (!isSomeoneTyping || !scrollEl) return;

    const distanceFromBottom =
      scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
    if (distanceFromBottom < 160) {
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: "smooth" });
    }
  }, [isSomeoneTyping, messagesScrollRef]);

  const dayGroups = activeConversation ? groupMessagesByDay(activeConversation.messages) : [];

  return (
    <div className="message-stage relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {activeConversation ? (
        <div
          ref={messagesScrollRef}
          className="message-scroll flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-2 py-3 sm:px-3 sm:py-4"
        >
          {dayGroups.map((group) => (
            <div key={group.dayKey} className="flex flex-col gap-1">
              <p className="message-date mb-3 mt-3 text-center text-[11px] font-medium uppercase tracking-wide text-muted first:mt-0">
                {group.label}
              </p>
              {group.messages.map((message) => (
                <MessageBubble key={message.id} message={message} isGroup={isGroup} />
              ))}
            </div>
          ))}
          <TypingIndicator
            key={activeConversationId}
            isVisible={isSomeoneTyping}
            label={isSomeoneTyping ? formatTypingLabel(typingNames) : ""}
            showLabel={isGroup}
          />
        </div>
      ) : (
        <NoConversationPlaceholder />
      )}
    </div>
  );
}
