import { Button, TextArea } from "@heroui/react";
import {
  LoaderIcon,
  MicIcon,
  PaperclipIcon,
  SendHorizontalIcon,
  SmileIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import useKeyboardSound from "../../hooks/useKeyboardSound";
import { formatDuration, useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import { useChatStore } from "../../store/useChatStore";
import { useGroupStore } from "../../store/useGroupStore";
import { useAiChatStore } from "../../store/useAiChatStore";
import { useSelectedConversation } from "../../hooks/useSelectedConversation";
import { useTypingEmitter } from "../../hooks/useTypingEmitter";
import { EmojiPicker } from "./EmojiPicker";
import { AttachmentMenu } from "./AttachmentMenu";
import { PollCreatorModal } from "./PollCreatorModal";

export function ChatComposer() {
  const composerText = useChatStore((state) => state.composerText);
  const isSoundEnabled = useChatStore((state) => state.isSoundEnabled);
  const setComposerText = useChatStore((state) => state.setComposerText);

  const sendMediaMessage = useChatStore((state) => state.sendMediaMessage);
  const isSendingMedia = useChatStore((state) => state.isSendingMedia);
  const sendTextMessage = useChatStore((state) => state.sendTextMessage);
  const sendStickerMessage = useChatStore((state) => state.sendStickerMessage);
  const sendGifMessage = useChatStore((state) => state.sendGifMessage);
  const sendVoiceMessage = useChatStore((state) => state.sendVoiceMessage);
  const sendLocationMessage = useChatStore((state) => state.sendLocationMessage);
  const sendPollMessage = useChatStore((state) => state.sendPollMessage);

  const sendGroupMediaMessage = useGroupStore((state) => state.sendGroupMediaMessage);
  const isSendingGroupMedia = useGroupStore((state) => state.isSendingGroupMedia);
  const sendGroupTextMessage = useGroupStore((state) => state.sendGroupTextMessage);
  const sendGroupStickerMessage = useGroupStore((state) => state.sendGroupStickerMessage);
  const sendGroupGifMessage = useGroupStore((state) => state.sendGroupGifMessage);
  const sendGroupVoiceMessage = useGroupStore((state) => state.sendGroupVoiceMessage);
  const sendGroupLocationMessage = useGroupStore((state) => state.sendGroupLocationMessage);
  const sendGroupPollMessage = useGroupStore((state) => state.sendGroupPollMessage);

  const sendAiMessage = useAiChatStore((state) => state.sendAiMessage);

  const { activeConversationId, activeConversationType } = useSelectedConversation();
  const isAi = activeConversationType === "ai";
  const { playRandomKeyStrokeSound } = useKeyboardSound();
  const { notifyTyping, stopTyping } = useTypingEmitter({
    // The AI thread has no socket presence on the other end, so there's
    // nothing to notify.
    conversationId: isAi ? null : activeConversationId,
    isGroup: activeConversationType === "group",
  });
  const mediaInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [isSendingLocation, setIsSendingLocation] = useState(false);

  const isGroup = activeConversationType === "group";
  const isSending = isGroup ? isSendingGroupMedia : isAi ? false : isSendingMedia;

  const playSoundIfEnabled = () => {
    if (isSoundEnabled) playRandomKeyStrokeSound();
  };

  // Uploads a finished recording (`{ file, duration }`) to the open chat.
  const sendVoiceNote = async (recording) => {
    if (!recording) return;

    const didSendMessage = isGroup
      ? await sendGroupVoiceMessage({ groupId: activeConversationId, ...recording })
      : await sendVoiceMessage({ conversationId: activeConversationId, ...recording });

    if (didSendMessage) playSoundIfEnabled();
  };

  const { isRecording, elapsedSeconds, startRecording, stopRecording, cancelRecording } =
    useVoiceRecorder({ onAutoStop: sendVoiceNote });

  // Switching chats (or leaving) mid-recording discards it, so a voice note
  // can never be sent to a different conversation than the one it was made in.
  useEffect(() => () => void cancelRecording(), [activeConversationId, cancelRecording]);

  const handleSendVoice = async () => {
    await sendVoiceNote(await stopRecording());
  };

  const handleSend = async () => {
    stopTyping();

    const didSendMessage = isGroup
      ? await sendGroupTextMessage(activeConversationId, composerText)
      : isAi
        ? await sendAiMessage(composerText)
        : await sendTextMessage(activeConversationId);

    if (didSendMessage) {
      setComposerText("");
      playSoundIfEnabled();
    }
  };

  const handleComposerTextChange = (event) => {
    const { value } = event.target;
    setComposerText(value);
    playSoundIfEnabled();

    // Emptying the box counts as stopping, not typing.
    if (value.trim()) notifyTyping();
    else stopTyping();
  };

  const handleMediaPick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const didSendMessage = isGroup
      ? await sendGroupMediaMessage({ groupId: activeConversationId, file })
      : await sendMediaMessage({ conversationId: activeConversationId, file });

    if (didSendMessage) playSoundIfEnabled();
  };

  const handleSendLocation = async () => {
    if (!activeConversationId || isSendingLocation) return;
    setIsSendingLocation(true);
    const didSendMessage = isGroup
      ? await sendGroupLocationMessage(activeConversationId)
      : await sendLocationMessage(activeConversationId);
    setIsSendingLocation(false);

    if (didSendMessage) playSoundIfEnabled();
  };

  const handleCreatePoll = async ({ question, options }) => {
    const didSendMessage = isGroup
      ? await sendGroupPollMessage(activeConversationId, { question, options })
      : await sendPollMessage(activeConversationId, { question, options });

    if (didSendMessage) playSoundIfEnabled();
    return didSendMessage;
  };

  // Appends the emoji to whatever's already typed.
  const handleSelectEmoji = (emoji) => {
    setComposerText(`${composerText}${emoji}`);
    playSoundIfEnabled();
    notifyTyping();
  };

  // Stickers and GIFs send immediately rather than going through the
  // composer text — picking one shouldn't touch a draft already in progress.
  const handleSelectSticker = async (sticker) => {
    const didSendMessage = isGroup
      ? await sendGroupStickerMessage(activeConversationId, sticker)
      : await sendStickerMessage(activeConversationId, sticker);

    if (didSendMessage) playSoundIfEnabled();
  };

  const handleSelectGif = async (gifUrl) => {
    const didSendMessage = isGroup
      ? await sendGroupGifMessage(activeConversationId, gifUrl)
      : await sendGifMessage(activeConversationId, gifUrl);

    if (didSendMessage) playSoundIfEnabled();
  };

  return (
    <footer className="chat-composer relative shrink-0 border-t border-border px-1.5 pb-2 pt-2 sm:px-2">
      {isSending ? (
        <div className="mx-auto mb-2 flex max-w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted">
          <LoaderIcon
            className="size-4 shrink-0 animate-spin text-accent"
            strokeWidth={2}
            aria-hidden
          />
          <span className="truncate">Uploading media...</span>
        </div>
      ) : null}
      {isRecording ? (
        <div className="relative mx-auto flex w-full max-w-full items-center gap-1.5 px-0.5 sm:gap-2 sm:px-1">
          <Button
            variant="ghost"
            isIconOnly
            aria-label="Cancel voice message"
            className="size-9 shrink-0 touch-manipulation text-red-500"
            onPress={cancelRecording}
          >
            <Trash2Icon className="size-5" strokeWidth={2} />
          </Button>

          <div className="voice-recording flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-full bg-surface px-4">
            <span className="voice-recording-dot size-2.5 shrink-0 rounded-full bg-red-500" aria-hidden />
            <span className="text-sm font-medium tabular-nums" aria-live="off">
              {formatDuration(elapsedSeconds)}
            </span>
            <span className="truncate text-sm text-muted">Recording…</span>
          </div>

          <Button
            variant="primary"
            isIconOnly
            aria-label="Send voice message"
            onPress={handleSendVoice}
          >
            <SendHorizontalIcon className="size-5" />
          </Button>
        </div>
      ) : (
        <div className="relative mx-auto flex w-full max-w-full items-end gap-1.5 px-0.5 sm:gap-2 sm:px-1">
          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={isSending}
            tabIndex={-1}
            aria-hidden
            onChange={handleMediaPick}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={isSending}
            tabIndex={-1}
            aria-hidden
            onChange={handleMediaPick}
          />
          {!isAi ? (
            <div className="relative shrink-0 self-end">
              {isAttachmentMenuOpen ? (
                <AttachmentMenu
                  onClose={() => setIsAttachmentMenuOpen(false)}
                  onPhoto={() => mediaInputRef.current?.click()}
                  onCamera={() => cameraInputRef.current?.click()}
                  onLocation={handleSendLocation}
                  onPoll={() => setIsPollModalOpen(true)}
                />
              ) : null}
              <Button
                variant="ghost"
                isIconOnly
                isDisabled={isSending || isSendingLocation}
                aria-pressed={isAttachmentMenuOpen}
                aria-label="Add attachment"
                className="size-9 shrink-0 touch-manipulation text-accent"
                onPress={() => setIsAttachmentMenuOpen((open) => !open)}
              >
                {isSendingLocation ? (
                  <LoaderIcon className="size-5 animate-spin sm:size-6" strokeWidth={2} aria-hidden />
                ) : (
                  <PaperclipIcon className="size-5 sm:size-6" strokeWidth={2} aria-hidden />
                )}
              </Button>
            </div>
          ) : null}

          <div className="relative shrink-0 self-end">
            {isEmojiPickerOpen ? (
              <EmojiPicker
                onSelectEmoji={handleSelectEmoji}
                onSelectSticker={handleSelectSticker}
                onSelectGif={handleSelectGif}
                onClose={() => setIsEmojiPickerOpen(false)}
                emojiOnly={isAi}
              />
            ) : null}
            <Button
              variant="ghost"
              isIconOnly
              isDisabled={isSending}
              aria-pressed={isEmojiPickerOpen}
              aria-label="Open emoji picker"
              className="size-9 touch-manipulation text-accent"
              onPress={() => setIsEmojiPickerOpen((open) => !open)}
            >
              <SmileIcon className="size-5 sm:size-6" strokeWidth={2} aria-hidden />
            </Button>
          </div>

          <TextArea
            fullWidth
            variant="secondary"
            placeholder="Type your message"
            rows={1}
            value={composerText}
            onChange={handleComposerTextChange}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            className="flex-1 rounded-full"
          />

          {composerText.trim() ? (
            <Button variant="primary" isIconOnly onPress={handleSend}>
              <SendHorizontalIcon className="size-5" />
            </Button>
          ) : isAi ? (
            <Button
              variant="primary"
              isIconOnly
              isDisabled
              aria-label="Type a message to send"
            >
              <SendHorizontalIcon className="size-5" />
            </Button>
          ) : (
            <Button
              variant="primary"
              isIconOnly
              isDisabled={isSending}
              aria-label="Record voice message"
              onPress={startRecording}
            >
              <MicIcon className="size-5" />
            </Button>
          )}
        </div>
      )}
      {isPollModalOpen ? (
        <PollCreatorModal onClose={() => setIsPollModalOpen(false)} onCreate={handleCreatePoll} />
      ) : null}
    </footer>
  );
}
