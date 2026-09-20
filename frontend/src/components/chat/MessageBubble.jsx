import { CheckCheck } from "lucide-react";
import { withTransform } from "../../lib/imagekit";
import { MessageVideo } from "./MessageVideo";
import { LocationCard } from "./LocationCard";
import { parseLocationMessage } from "../../lib/location";

// Compress + size images for the bubble (q-auto works for images; f-auto picks WebP/AVIF).
const IMAGE_TRANSFORM = "q-auto,w-640,f-auto";

// A message that's just 1-3 emoji (what the sticker picker sends) renders
// jumbo-sized with no bubble chrome, the way WhatsApp/Telegram/iMessage
// treat lone-emoji texts — it reads as a sticker rather than a sentence.
const STICKER_TEXT_REGEX =
  /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*){1,3}$/u;

export function MessageBubble({ message }) {
  const isOwnMessage = message.role === "me";
  const hasImage = Boolean(message.imageUrl);
  const hasVideo = Boolean(message.videoUrl);
  const isSticker =
    !hasImage && !hasVideo && STICKER_TEXT_REGEX.test((message.text || "").trim());
  // `seen` only exists on DM messages (group messages don't track it),
  // so ticks are scoped to 1:1 chats for free.
  const showReceipt = isOwnMessage && typeof message.seen === "boolean";
  const location = !hasImage && !hasVideo ? parseLocationMessage(message.text) : null;

  // Shared locations are a map card, not a text bubble — the card is its
  // own container, so like stickers there's no bubble chrome around it.
  if (location) {
    return (
      <div className={`flex w-full ${isOwnMessage ? "justify-end" : "justify-start"}`}>
        <div className={`flex max-w-[min(90%,28rem)] flex-col gap-1 ${isOwnMessage ? "items-end" : "items-start"}`}>
          {message.senderName ? (
            <p className="px-1 text-[12px] font-semibold text-accent">{message.senderName}</p>
          ) : null}
          <LocationCard
            {...location}
            avatarUrl={message.senderAvatarUrl}
            name={isOwnMessage ? null : message.senderFullName}
            avatarName={message.senderFullName}
          />
          <p
            className={`flex items-center gap-1 px-1 text-[11px] tabular-nums text-muted ${
              isOwnMessage ? "justify-end" : ""
            }`}
          >
            {message.time}
            {showReceipt ? (
              <CheckCheck
                size={14}
                strokeWidth={2.25}
                className={message.seen ? "text-sky-400" : "text-muted"}
                aria-label={message.seen ? "Seen" : "Sent"}
              />
            ) : null}
          </p>
        </div>
      </div>
    );
  }

  if (isSticker) {
    return (
      <div className={`flex w-full ${isOwnMessage ? "justify-end" : "justify-start"}`}>
        <div className={`flex max-w-[min(90%,28rem)] flex-col gap-0.5 ${isOwnMessage ? "items-end" : "items-start"}`}>
          {message.senderName ? (
            <p className="px-1 text-[12px] font-semibold text-accent">{message.senderName}</p>
          ) : null}
          <p className="text-6xl leading-none">{message.text}</p>
          <p
            className={`flex items-center gap-1 px-1 text-[11px] tabular-nums text-muted ${
              isOwnMessage ? "justify-end" : ""
            }`}
          >
            {message.time}
            {showReceipt ? (
              <CheckCheck
                size={14}
                strokeWidth={2.25}
                className={message.seen ? "text-sky-400" : "text-muted"}
                aria-label={message.seen ? "Seen" : "Sent"}
              />
            ) : null}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex w-full ${isOwnMessage ? "justify-end" : "justify-start"}`}>
      <div
        className={`message-bubble max-w-[min(90%,28rem)] rounded-2xl px-3 py-2 text-[15px] leading-snug sm:max-w-[min(75%,28rem)] sm:px-3.5 ${
          isOwnMessage
            ? "rounded-br-md bg-accent text-accent-foreground"
            : "rounded-bl-md bg-surface"
        }`}
      >
        {message.senderName ? (
          <p className="mb-0.5 text-[12px] font-semibold text-accent">{message.senderName}</p>
        ) : null}
        {hasImage ? (
          <img
            src={withTransform(message.imageUrl, IMAGE_TRANSFORM)}
            alt=""
            className="mb-1.5 max-h-40 max-w-full rounded-lg object-cover sm:max-h-52 sm:rounded-xl"
          />
        ) : null}
        {hasVideo ? <MessageVideo src={message.videoUrl} /> : null}
        {message.text ? (
          <p className="whitespace-pre-wrap wrap-break-word">{message.text}</p>
        ) : null}
        <p
          className={`mt-1 flex items-center gap-1 text-[11px] tabular-nums ${
            isOwnMessage ? "justify-end text-accent-foreground/75" : "text-muted"
          }`}
        >
          {message.time}
          {showReceipt ? (
            <CheckCheck
              size={14}
              strokeWidth={2.25}
              className={message.seen ? "text-sky-400" : "text-accent-foreground/75"}
              aria-label={message.seen ? "Seen" : "Sent"}
            />
          ) : null}
        </p>
      </div>
    </div>
  );
}
