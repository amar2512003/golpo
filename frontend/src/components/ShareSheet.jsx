import { useEffect } from "react";
import { Button } from "@heroui/react";
import { LinkIcon, MailIcon, MessageCircleIcon, Share2Icon, XIcon } from "lucide-react";
import toast from "react-hot-toast";
import { buildShareMessage, buildGmailShareUrl, buildWhatsAppShareUrl, canUseNativeShare } from "../lib/share";

// A small bottom-sheet (desktop: centered card) offering the usual
// "share this link" destinations — WhatsApp, Gmail, copy, and whatever
// the OS share sheet offers on top of that. Used for both the DM invite
// link and the group invite link, so the brief/url/subject are all
// passed in rather than hardcoded.
export function ShareSheet({ subject, text, url, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildShareMessage({ text, url }));
      toast.success("Invite copied");
      onClose();
    } catch {
      toast.error("Couldn't copy — copy it manually");
    }
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title: subject, text, url });
      onClose();
    } catch {
      // Cancelled or unsupported mid-flow — nothing to surface to the user.
    }
  };

  const openExternal = (href) => {
    window.open(href, "_blank", "noopener,noreferrer");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl border border-border bg-background p-4 text-foreground sm:rounded-2xl"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[15px] font-semibold">Share invite</p>
          <Button variant="ghost" size="sm" isIconOnly onPress={onClose} aria-label="Close">
            <XIcon className="size-5" />
          </Button>
        </div>

        <p className="mb-4 rounded-xl bg-surface px-3 py-2 text-xs text-muted">{text}</p>

        <div className="grid grid-cols-4 gap-2">
          <ShareOption
            label="WhatsApp"
            bgClassName="bg-[#25D366]"
            icon={<MessageCircleIcon className="size-5" />}
            onClick={() => openExternal(buildWhatsAppShareUrl({ text, url }))}
          />
          <ShareOption
            label="Gmail"
            bgClassName="bg-[#EA4335]"
            icon={<MailIcon className="size-5" />}
            onClick={() => openExternal(buildGmailShareUrl({ subject, text, url }))}
          />
          <ShareOption
            label="Copy link"
            bgClassName="bg-accent"
            icon={<LinkIcon className="size-5" />}
            onClick={handleCopy}
          />
          {canUseNativeShare() ? (
            <ShareOption
              label="More"
              bgClassName="bg-foreground/70"
              icon={<Share2Icon className="size-5" />}
              onClick={handleNativeShare}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ShareOption({ label, icon, onClick, bgClassName }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-center"
    >
      <span className={`flex size-12 items-center justify-center rounded-full text-white ${bgClassName}`}>
        {icon}
      </span>
      <span className="truncate text-xs font-medium">{label}</span>
    </button>
  );
}
