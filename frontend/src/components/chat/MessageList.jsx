import useScrollToBottom from "../../hooks/useScrollToBottom";
import { MessageBubble } from "./MessageBubble";
import { NoConversationPlaceholder } from "./NoConversationPlaceholder";
import { useSelectedConversation } from "../../hooks/useSelectedConversation";
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

export function MessageList() {
  const { activeConversation, activeConversationId } = useSelectedConversation();

  const lastMessageId = activeConversation?.messages.at(-1)?.id;
  const messagesScrollRef = useScrollToBottom(activeConversationId, lastMessageId);

  const dayGroups = activeConversation ? groupMessagesByDay(activeConversation.messages) : [];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {activeConversation ? (
        <div
          ref={messagesScrollRef}
          className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-2 py-3 sm:px-3 sm:py-4"
        >
          {dayGroups.map((group) => (
            <div key={group.dayKey} className="flex flex-col gap-1">
              <p className="mb-3 mt-3 text-center text-[11px] font-medium uppercase tracking-wide text-muted first:mt-0">
                {group.label}
              </p>
              {group.messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <NoConversationPlaceholder />
      )}
    </div>
  );
}
