import { CheckCheck } from "lucide-react";
import { withTransform } from "../../lib/imagekit";
import { splitTextWithLinks } from "../../lib/utils";
import { parseLocationMessage } from "../../lib/location";
import { LocationCard } from "./LocationCard";
import { MessageVideo } from "./MessageVideo";
import { VoiceMessagePlayer } from "./VoiceMessagePlayer";
import { PollBubble } from "./PollBubble";

// Compress + size images for the bubble (q-auto works for images; f-auto picks WebP/AVIF).
const IMAGE_TRANSFORM = "q-auto,w-640,f-auto";

// A message that's just 1-3 emoji (what the sticker picker sends) renders
// jumbo-sized with no bubble chrome, the way WhatsApp/Telegram/iMessage
// treat lone-emoji texts — it reads as a sticker rather than a sentence.
const STICKER_TEXT_REGEX =
  /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*){1,3}$/u;

// Renders message text with bare URLs (e.g. the Google Maps link in a
// shared location) turned into tappable links instead of dead text.
function MessageText({ text, isOwnMessage }) {
  const segments = splitTextWithLinks(text);
  return (
    <p className="whitespace-pre-wrap wrap-break-word">
      {segments.map((segment, index) =>
        typeof segment === "string" ? (
          <span key={index}>{segment}</span>
        ) : (
          <a
            key={index}
            href={segment.href}
            target="_blank"
            rel="noreferrer noopener"
            className={`underline underline-offset-2 ${
              isOwnMessage ? "text-accent-foreground" : "text-accent"
            }`}
          >
            {segment.label}
          </a>
        ),
      )}
    </p>
  );
}

export function MessageBubble({ message, isGroup }) {
  const isOwnMessage = message.role === "me";
  // A shared location arrives as text ("📍 My location: <maps link>"); when
  // it does, the bubble shows a map card instead of the raw link. Older
  // location messages also carry a static-map imageUrl — the card replaces
  // that too, so it's ignored for these.
  const location = parseLocationMessage(message.text);
  const hasImage = Boolean(message.imageUrl) && !location;
  const hasVideo = Boolean(message.videoUrl);
  const hasAudio = Boolean(message.audioUrl);
  const hasPoll = Boolean(message.poll?.question) && (message.poll?.options?.length ?? 0) > 0;
  const statusReply = message.statusReply;
  const isSticker =
    !hasImage &&
    !hasVideo &&
    !hasAudio &&
    !hasPoll &&
    !statusReply &&
    !location &&
    STICKER_TEXT_REGEX.test((message.text || "").trim());
  // `seen` only exists on DM messages (group messages don't track it),
  // so ticks are scoped to 1:1 chats for free.
  const showReceipt = isOwnMessage && typeof message.seen === "boolean";

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
        className={`message-bubble ${
          location ? "message-bubble--location" : ""
        } max-w-[min(90%,28rem)] rounded-2xl px-3 py-2 text-[15px] leading-snug sm:max-w-[min(75%,28rem)] sm:px-3.5 ${
          isOwnMessage
            ? "rounded-br-md bg-accent text-accent-foreground"
            : "rounded-bl-md bg-surface"
        }`}
      >
        {message.senderName ? (
          <p className="mb-0.5 text-[12px] font-semibold text-accent">{message.senderName}</p>
        ) : null}
        {statusReply ? (
          <div
            className={`mb-1.5 flex items-center gap-2 rounded-lg border-l-2 p-1.5 ${
              isOwnMessage
                ? "border-accent-foreground/40 bg-accent-foreground/10"
                : "border-accent bg-background/60"
            }`}
          >
            {statusReply.image ? (
              <img
                src={withTransform(statusReply.image, "q-auto,w-96,f-auto")}
                alt=""
                className="size-10 shrink-0 rounded-md object-cover"
              />
            ) : null}
            <p
              className={`min-w-0 truncate text-[12px] ${
                isOwnMessage ? "text-accent-foreground/75" : "text-muted"
              }`}
            >
              {statusReply.caption || "Replied to a status"}
            </p>
          </div>
        ) : null}
        {hasImage ? (
          <img
            src={withTransform(message.imageUrl, IMAGE_TRANSFORM)}
            alt=""
            className="mb-1.5 max-h-40 max-w-full rounded-lg object-cover sm:max-h-52 sm:rounded-xl"
          />
        ) : null}
        {hasVideo ? <MessageVideo src={message.videoUrl} /> : null}
        {hasAudio ? (
          <VoiceMessagePlayer
            src={message.audioUrl}
            duration={message.audioDuration}
            isOwnMessage={isOwnMessage}
          />
        ) : null}
        {hasPoll ? (
          <PollBubble
            messageId={message.id}
            poll={message.poll}
            isGroup={isGroup}
            isOwnMessage={isOwnMessage}
          />
        ) : null}
        {location ? (
          <LocationCard
            latitude={location.latitude}
            longitude={location.longitude}
            href={location.href}
          />
        ) : message.text ? (
          <MessageText text={message.text} isOwnMessage={isOwnMessage} />
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
