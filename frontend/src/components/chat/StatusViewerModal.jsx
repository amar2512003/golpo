import { useEffect, useRef, useState } from "react";
import { Avatar, Button } from "@heroui/react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  LoaderIcon,
  SendIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import toast from "react-hot-toast";

import { useStatusStore } from "../../store/useStatusStore";
import { useChatStore } from "../../store/useChatStore";
import { getInitials } from "../../hooks/useSelectedConversation";
import { formatTimeAgo, formatTimeLeft } from "../../lib/utils";

const SLIDE_DURATION_MS = 5000;

export function StatusViewerModal() {
  const viewerUserId = useStatusStore((state) => state.viewerUserId);
  const viewerIndex = useStatusStore((state) => state.viewerIndex);
  const mine = useStatusStore((state) => state.mine);
  const others = useStatusStore((state) => state.others);
  const closeStatusViewer = useStatusStore((state) => state.closeStatusViewer);
  const advanceStatusViewer = useStatusStore((state) => state.advanceStatusViewer);
  const rewindStatusViewer = useStatusStore((state) => state.rewindStatusViewer);
  const markStatusSeen = useStatusStore((state) => state.markStatusSeen);
  const deleteStatus = useStatusStore((state) => state.deleteStatus);
  const sendStatusReplyMessage = useChatStore((state) => state.sendStatusReplyMessage);

  // Progress for the current slide, 0-1. Paused while the image is still
  // loading (so a slow connection doesn't burn the whole 5 seconds on a
  // blank frame) and while the viewer holds the screen down.
  const [progress, setProgress] = useState(0);
  const [isImageReady, setIsImageReady] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);

  const isMine = Boolean(mine && mine.userId === viewerUserId);
  const bucket = isMine ? mine : others.find((entry) => entry.userId === viewerUserId);
  const status = bucket?.statuses?.[viewerIndex];

  const advanceRef = useRef(advanceStatusViewer);
  advanceRef.current = advanceStatusViewer;

  // Reset the slide whenever we move to a different status.
  useEffect(() => {
    setProgress(0);
    setIsImageReady(false);
    setShowViewers(false);
    setReplyText("");
  }, [status?._id]);

  // Opening someone's status is what marks it seen — that's what turns
  // their ring from orange back to grey.
  useEffect(() => {
    if (!status?._id || isMine) return;
    markStatusSeen(status._id);
  }, [status?._id, isMine, markStatusSeen]);

  // The auto-advance timer. Ticks the progress bar rather than firing one
  // long timeout, so pausing (press and hold) can freeze it mid-slide.
  useEffect(() => {
    if (!status || !isImageReady || isPaused || showViewers || replyText) return;

    const tickMs = 50;
    const timer = setInterval(() => {
      setProgress((current) => {
        const next = current + tickMs / SLIDE_DURATION_MS;
        if (next >= 1) {
          advanceRef.current();
          return 0;
        }
        return next;
      });
    }, tickMs);

    return () => clearInterval(timer);
  }, [status, isImageReady, isPaused, showViewers, replyText]);

  // Keyboard controls: arrows to move through the reel, Escape to leave.
  useEffect(() => {
    if (!viewerUserId) return;

    const handleKeyDown = (event) => {
      // Don't hijack arrow keys or Escape while the person is typing a
      // reply — Escape should close the composer's focus, not the
      // whole viewer, and the arrows should move the cursor, not the reel.
      const tag = event.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (event.key === "Escape") closeStatusViewer();
      else if (event.key === "ArrowRight") advanceStatusViewer();
      else if (event.key === "ArrowLeft") rewindStatusViewer();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewerUserId, closeStatusViewer, advanceStatusViewer, rewindStatusViewer]);

  // The reel can empty out underneath us — the status expired mid-view,
  // or the author deleted it — so bail out rather than render a blank.
  useEffect(() => {
    if (viewerUserId && !status) closeStatusViewer();
  }, [viewerUserId, status, closeStatusViewer]);

  if (!viewerUserId || !bucket || !status) return null;

  const handleDelete = async () => {
    const deleted = await deleteStatus(status._id);
    if (deleted) closeStatusViewer();
  };

  const handleReplySubmit = async (event) => {
    event.preventDefault();
    const trimmed = replyText.trim();
    if (!trimmed || isSendingReply) return;

    setIsSendingReply(true);
    const sent = await sendStatusReplyMessage({
      receiverId: bucket.userId,
      statusId: status._id,
      text: trimmed,
    });
    setIsSendingReply(false);

    if (sent) {
      setReplyText("");
      toast.success(`Reply sent to ${bucket.fullName}`);
    }
  };

  const viewers = status.viewers || [];

  return (
    <div className="status-viewer fixed inset-0 z-[60] flex flex-col bg-black/95">
      {/* Progress bars — one segment per status in this person's reel. */}
      <div className="flex shrink-0 gap-1 px-3 pt-3">
        {bucket.statuses.map((entry, index) => (
          <div key={entry._id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white"
              style={{
                width:
                  index < viewerIndex
                    ? "100%"
                    : index === viewerIndex
                      ? `${Math.min(progress * 100, 100)}%`
                      : "0%",
                transition: index === viewerIndex ? "width 50ms linear" : "none",
              }}
            />
          </div>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-3 px-4 py-3">
        <Avatar className="size-9 shrink-0">
          <Avatar.Image alt={bucket.fullName} src={bucket.profilePic} />
          <Avatar.Fallback className="text-xs font-medium">
            {getInitials(bucket.fullName || "?")}
          </Avatar.Fallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {isMine ? "Your status" : bucket.fullName}
          </p>
          <p className="truncate text-[11px] text-white/60">
            {formatTimeAgo(status.createdAt)}
            {isMine ? ` · ${formatTimeLeft(status.expiresAt)}` : ""}
          </p>
        </div>

        {isMine ? (
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-full p-2 text-white/80 hover:bg-white/10"
            aria-label="Delete status"
          >
            <TrashIcon className="size-5" />
          </button>
        ) : null}

        <button
          type="button"
          onClick={closeStatusViewer}
          className="rounded-full p-2 text-white/80 hover:bg-white/10"
          aria-label="Close status"
        >
          <XIcon className="size-5" />
        </button>
      </div>

      {/* The image itself, with tap zones either side for back/forward. */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 pb-2">
        <img
          src={status.image}
          alt={status.caption || "Status"}
          onLoad={() => setIsImageReady(true)}
          onError={() => setIsImageReady(true)}
          className="max-h-full max-w-full rounded-2xl object-contain"
        />

        {!isImageReady ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="size-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        ) : null}

        <button
          type="button"
          onClick={rewindStatusViewer}
          onPointerDown={() => setIsPaused(true)}
          onPointerUp={() => setIsPaused(false)}
          onPointerLeave={() => setIsPaused(false)}
          className="absolute inset-y-0 left-0 w-1/3 cursor-pointer"
          aria-label="Previous status"
        />
        <button
          type="button"
          onClick={advanceStatusViewer}
          onPointerDown={() => setIsPaused(true)}
          onPointerUp={() => setIsPaused(false)}
          onPointerLeave={() => setIsPaused(false)}
          className="absolute inset-y-0 right-0 w-1/3 cursor-pointer"
          aria-label="Next status"
        />

        {/* Explicit arrows for pointer users, since the tap zones are invisible. */}
        <button
          type="button"
          onClick={rewindStatusViewer}
          className="absolute left-3 hidden rounded-full bg-white/10 p-2 text-white/80 hover:bg-white/20 lg:block"
          aria-label="Previous"
        >
          <ChevronLeftIcon className="size-5" />
        </button>
        <button
          type="button"
          onClick={advanceStatusViewer}
          className="absolute right-3 hidden rounded-full bg-white/10 p-2 text-white/80 hover:bg-white/20 lg:block"
          aria-label="Next"
        >
          <ChevronRightIcon className="size-5" />
        </button>

        {status.caption ? (
          <p className="pointer-events-none absolute inset-x-4 bottom-4 rounded-xl bg-black/55 px-4 py-2.5 text-center text-sm text-white backdrop-blur-sm">
            {status.caption}
          </p>
        ) : null}
      </div>

      {/* Only the author sees who watched; everyone else gets a box to
          reply straight to this status, which lands as a normal DM
          tagged with a preview of what they replied to. */}
      {isMine ? (
        <div className="shrink-0 px-4 pb-4">
          <Button
            variant="ghost"
            fullWidth
            className="justify-center text-white"
            onPress={() => setShowViewers((open) => !open)}
          >
            <EyeIcon className="size-4" aria-hidden />
            {viewers.length === 0
              ? "No views yet"
              : `${viewers.length} view${viewers.length === 1 ? "" : "s"}`}
          </Button>

          {showViewers && viewers.length > 0 ? (
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-xl bg-white/10 p-2">
              {viewers.map((viewer) => {
                const person = viewer.userId || {};
                return (
                  <div
                    key={String(person._id || person)}
                    className="flex items-center gap-2 px-1 py-1"
                  >
                    <Avatar className="size-7 shrink-0">
                      <Avatar.Image alt={person.fullName} src={person.profilePic} />
                      <Avatar.Fallback className="text-[10px]">
                        {getInitials(person.fullName || "?")}
                      </Avatar.Fallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-xs text-white">
                      {person.fullName || "Someone"}
                    </span>
                    <span className="shrink-0 text-[10px] text-white/50">
                      {formatTimeAgo(viewer.seenAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : (
        <form
          onSubmit={handleReplySubmit}
          className="flex shrink-0 items-center gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
        >
          <input
            type="text"
            value={replyText}
            maxLength={500}
            onChange={(event) => setReplyText(event.target.value)}
            onFocus={() => setIsPaused(true)}
            onBlur={() => setIsPaused(false)}
            placeholder={`Reply to ${bucket.fullName}`}
            className="min-w-0 flex-1 rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder-white/50 outline-none focus:border-white/40"
          />
          <button
            type="submit"
            disabled={!replyText.trim() || isSendingReply}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-black transition-opacity disabled:opacity-40"
            aria-label="Send reply"
          >
            {isSendingReply ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              <SendIcon className="size-4" />
            )}
          </button>
        </form>
      )}
    </div>
  );
}
