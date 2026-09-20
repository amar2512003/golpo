import { useEffect, useRef } from "react";
import {
  CameraIcon,
  FileIcon,
  ImageIcon,
  ListChecksIcon,
  MapPinIcon,
  VideoIcon,
  XIcon,
} from "lucide-react";

// Each item is either a live action (onSelect) or, for Video/Files,
// disabled — shown crossed-out with the reason instead of wired up, since
// those two aren't supported yet (storage constraints).
const RESTRICTED_NOTE = "Restricted due to memory constraints";

export function AttachmentMenu({ onClose, onPhoto, onCamera, onLocation, onPoll }) {
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

  const items = [
    { id: "photo", label: "Photo", Icon: ImageIcon, onSelect: onPhoto },
    { id: "camera", label: "Camera", Icon: CameraIcon, onSelect: onCamera },
    { id: "video", label: "Video", Icon: VideoIcon, disabled: true },
    { id: "files", label: "Files", Icon: FileIcon, disabled: true },
    { id: "location", label: "Location", Icon: MapPinIcon, onSelect: onLocation },
    { id: "poll", label: "Poll", Icon: ListChecksIcon, onSelect: onPoll },
  ];

  const handleSelect = (item) => {
    if (item.disabled) return;
    item.onSelect?.();
    onClose?.();
  };

  return (
    <div
      ref={panelRef}
      className="attachment-menu absolute bottom-full left-0 z-20 mb-2 w-64 rounded-2xl border border-border bg-surface p-3 shadow-xl"
      role="dialog"
      aria-label="Attach"
    >
      <div className="grid grid-cols-3 gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleSelect(item)}
            disabled={item.disabled}
            title={item.disabled ? RESTRICTED_NOTE : item.label}
            className={`relative flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-[11px] font-medium transition-colors ${
              item.disabled
                ? "cursor-not-allowed opacity-40"
                : "text-foreground hover:bg-surface-secondary"
            }`}
          >
            <span
              className={`relative flex size-10 items-center justify-center rounded-full ${
                item.disabled ? "bg-surface-secondary" : "bg-accent-soft text-accent"
              }`}
            >
              <item.Icon className="size-5" strokeWidth={2} aria-hidden />
              {item.disabled ? (
                <XIcon
                  className="absolute -right-1 -top-1 size-4 rounded-full bg-red-500 p-0.5 text-white"
                  strokeWidth={3}
                  aria-hidden
                />
              ) : null}
            </span>
            {item.label}
          </button>
        ))}
      </div>
      <p className="mt-2 px-1 text-center text-[10px] text-muted">
        Video and Files: {RESTRICTED_NOTE.toLowerCase()}
      </p>
    </div>
  );
}
