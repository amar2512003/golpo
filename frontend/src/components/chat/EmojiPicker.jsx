import { useEffect, useRef, useState } from "react";
import { SmileIcon, StickerIcon, ClapperboardIcon, SearchIcon, LoaderIcon } from "lucide-react";
import { fetchTrendingGifs, searchGifs } from "../../lib/giphy";

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

// "Sticker packs" — big, single-emoji stickers grouped by mood, sent
// straight away instead of being appended to the composer. MessageBubble
// renders a lone emoji like this jumbo-sized once it lands in the thread.
const STICKER_PACKS = [
  {
    label: "Reactions",
    stickers: ["😂", "😭", "😍", "😡", "😱", "🥳", "🤯", "🥹", "😴", "🤢"],
  },
  {
    label: "Love",
    stickers: ["❤️", "💕", "💘", "💋", "🥰", "😘", "💐", "🌹", "😻", "💍"],
  },
  {
    label: "Hands",
    stickers: ["👍", "👎", "👏", "🙌", "🤝", "🙏", "💪", "🤙", "👌", "✌️"],
  },
  {
    label: "Celebrate",
    stickers: ["🎉", "🎊", "🥂", "🎂", "🏆", "🔥", "✨", "🚀", "🎈", "💯"],
  },
];

const TABS = [
  { id: "emoji", label: "Emoji", Icon: SmileIcon },
  { id: "stickers", label: "Stickers", Icon: StickerIcon },
  { id: "gifs", label: "GIFs", Icon: ClapperboardIcon },
];

function StickersTab({ onSelectSticker }) {
  return (
    <div className="space-y-3">
      {STICKER_PACKS.map((pack) => (
        <div key={pack.label}>
          <p className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {pack.label}
          </p>
          <div className="grid grid-cols-5 gap-1">
            {pack.stickers.map((sticker) => (
              <button
                key={sticker}
                type="button"
                onClick={() => onSelectSticker?.(sticker)}
                className="flex aspect-square items-center justify-center rounded-lg text-3xl transition-colors hover:bg-surface-secondary"
                aria-label={`Send ${sticker} sticker`}
              >
                {sticker}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function GifsTab({ onSelectGif }) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    // Debounce so every keystroke doesn't fire a request.
    const timer = setTimeout(async () => {
      try {
        const results = query.trim()
          ? await searchGifs(query.trim())
          : await fetchTrendingGifs();
        if (!cancelled) setGifs(results);
      } catch {
        if (!cancelled) setError("Couldn't load GIFs right now");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="flex h-full flex-col">
      <div className="relative mb-2 shrink-0">
        <SearchIcon
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search GIFs"
          className="w-full rounded-lg border border-border bg-surface-secondary py-1.5 pl-8 pr-2.5 text-xs outline-none focus:border-accent"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted">
            <LoaderIcon className="size-6 animate-spin" strokeWidth={2} aria-hidden />
            <p className="text-xs">Loading GIFs…</p>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-muted">
            <ClapperboardIcon className="size-7" strokeWidth={1.5} aria-hidden />
            <p className="text-xs font-medium">{error}</p>
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-muted">
            <p className="text-xs font-medium">No GIFs found</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => onSelectGif?.(gif.fullUrl)}
                className="block w-full shrink-0 overflow-hidden rounded-xl bg-surface-secondary transition-opacity hover:opacity-80"
              >
                <img
                  src={gif.previewUrl}
                  alt={gif.title}
                  loading="lazy"
                  style={{ aspectRatio: `${gif.previewWidth} / ${gif.previewHeight}` }}
                  className="block max-h-56 w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function EmojiPicker({ onSelectEmoji, onSelectSticker, onSelectGif, onClose }) {
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

  // Stickers and GIFs send immediately, so the picker closes right after —
  // unlike an emoji, which just gets appended to whatever's being typed.
  const handleSelectSticker = (sticker) => {
    onSelectSticker?.(sticker);
    onClose?.();
  };

  const handleSelectGif = (gifUrl) => {
    onSelectGif?.(gifUrl);
    onClose?.();
  };

  return (
    <div
      ref={panelRef}
      className={`emoji-picker absolute bottom-full left-0 z-20 mb-2 flex max-h-[70dvh] w-72 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl sm:w-80 ${
        activeTab === "gifs" ? "h-96" : "h-80"
      }`}
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
        ) : activeTab === "stickers" ? (
          <StickersTab onSelectSticker={handleSelectSticker} />
        ) : (
          <GifsTab onSelectGif={handleSelectGif} />
        )}
      </div>
    </div>
  );
}
