import { useEffect, useRef, useState } from "react";
import { SmileIcon, StickerIcon, ClapperboardIcon } from "lucide-react";

// A small, dependency-free emoji picker. Stickers and GIFs are stubbed in
// as "coming soon" tabs so the UI already has a home for them once that
// content pipeline exists — no need to restructure the composer again later.
const EMOJI_GROUPS = [
  {
    label: "Smileys",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
      "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙",
      "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔",
    ],
  },
  {
    label: "Gestures",
    emojis: [
      "👍", "👎", "👌", "🤌", "✌️", "🤞", "🤟", "🤘", "👏", "🙌",
      "🙏", "🤝", "💪", "👋", "🖐️", "✋", "🫡", "👆", "👇", "☝️",
    ],
  },
  {
    label: "Hearts",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
      "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "😻", "😢",
    ],
  },
  {
    label: "Objects",
    emojis: [
      "🔥", "✨", "🎉", "🎊", "🎁", "🏆", "⭐", "🌟", "💯", "✅",
      "❌", "❓", "❗", "💤", "☕", "🍕", "🍔", "🎮", "📷", "🎵",
    ],
  },
];

const TABS = [
  { id: "emoji", label: "Emoji", Icon: SmileIcon },
  { id: "stickers", label: "Stickers", Icon: StickerIcon },
  { id: "gifs", label: "GIFs", Icon: ClapperboardIcon },
];

export function EmojiPicker({ onSelectEmoji, onClose }) {
  const [activeTab, setActiveTab] = useState("emoji");
  const panelRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        onClose?.();
      }
    }
    function handleEscape(event) {
      if (event.key === "Escape") onClose?.();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="emoji-picker absolute bottom-full left-0 z-20 mb-2 flex h-80 w-72 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl sm:w-80"
      role="dialog"
      aria-label="Emoji picker"
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-border p-1.5">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
              activeTab === id
                ? "bg-accent-soft text-accent"
                : "text-muted hover:bg-surface-secondary"
            }`}
          >
            <Icon className="size-4" strokeWidth={2} aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {activeTab === "emoji" ? (
          <div className="space-y-3">
            {EMOJI_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {group.label}
                </p>
                <div className="grid grid-cols-7 gap-0.5">
                  {group.emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => onSelectEmoji?.(emoji)}
                      className="flex aspect-square items-center justify-center rounded-lg text-lg transition-colors hover:bg-surface-secondary"
                      aria-label={`Insert ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted">
            {activeTab === "stickers" ? (
              <StickerIcon className="size-8" strokeWidth={1.5} aria-hidden />
            ) : (
              <ClapperboardIcon className="size-8" strokeWidth={1.5} aria-hidden />
            )}
            <p className="text-sm font-medium">
              {activeTab === "stickers" ? "Stickers" : "GIFs"} are coming soon
            </p>
            <p className="max-w-52 text-xs">
              This tab is ready to go — we'll plug in the {activeTab === "stickers" ? "sticker" : "GIF"} picker here next.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
