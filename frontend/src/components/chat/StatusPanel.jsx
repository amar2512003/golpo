import { useEffect, useRef, useState } from "react";
import { Avatar, Button } from "@heroui/react";
import { ImagePlusIcon, LoaderIcon, PlusIcon, XIcon } from "lucide-react";

import { useAuthStore } from "../../store/useAuthStore";
import { useStatusStore } from "../../store/useStatusStore";
import { getInitials } from "../../hooks/useSelectedConversation";
import { formatTimeAgo } from "../../lib/utils";
import { StatusRing } from "./StatusRing";

const MAX_STATUS_BYTES = 25 * 1024 * 1024; // matches the server's upload limit

// Preview + caption step between picking an image and posting it, so
// nothing goes up to a person's contacts by accident on a stray tap.
function StatusComposer({ file, onCancel, onPosted }) {
  const postStatus = useStatusStore((state) => state.postStatus);
  const isPostingStatus = useStatusStore((state) => state.isPostingStatus);

  const [caption, setCaption] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");

  // Object URLs have to be revoked or the blob stays in memory for the
  // life of the tab.
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handlePost = async () => {
    const posted = await postStatus({ file, caption });
    if (posted) onPosted();
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <p className="text-[15px] font-semibold">New status</p>
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            onPress={onCancel}
            isDisabled={isPostingStatus}
            aria-label="Cancel"
          >
            <XIcon className="size-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Status preview"
              className="max-h-[45dvh] w-full rounded-xl object-contain"
            />
          ) : null}

          <input
            type="text"
            value={caption}
            maxLength={200}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Add a caption (optional)"
            className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-accent"
          />

          <p className="mt-2 text-xs text-muted">
            Only people you chat with can see this, and it disappears after 24 hours.
          </p>
        </div>

        <div className="shrink-0 border-t border-border px-4 py-3">
          <Button variant="primary" fullWidth isDisabled={isPostingStatus} onPress={handlePost}>
            {isPostingStatus ? (
              <>
                <LoaderIcon className="size-4 animate-spin" aria-hidden />
                Posting...
              </>
            ) : (
              <>
                <ImagePlusIcon className="size-4" aria-hidden />
                Share status
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ name, subtitle, avatarUrl, hasStatus, hasUnseen, onOpen, trailing }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="conversation-row flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left"
    >
      <StatusRing hasStatus={hasStatus} hasUnseen={hasUnseen}>
        <Avatar className="size-12 shrink-0">
          <Avatar.Image alt={name} src={avatarUrl} />
          <Avatar.Fallback className="text-sm font-medium">
            {getInitials(name || "?")}
          </Avatar.Fallback>
        </Avatar>
      </StatusRing>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-[15px] ${hasUnseen ? "font-bold" : "font-semibold"}`}>{name}</p>
        <p className={`truncate text-xs ${hasUnseen ? "font-medium text-accent" : "text-muted"}`}>
          {subtitle}
        </p>
      </div>

      {trailing}
    </button>
  );
}

export function StatusPanel() {
  const authUser = useAuthStore((state) => state.authUser);

  const mine = useStatusStore((state) => state.mine);
  const others = useStatusStore((state) => state.others);
  const isStatusLoading = useStatusStore((state) => state.isStatusLoading);
  const openStatusViewer = useStatusStore((state) => state.openStatusViewer);

  const fileInputRef = useRef(null);
  const [pendingFile, setPendingFile] = useState(null);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    // Reset first, so picking the same file twice in a row still fires.
    event.target.value = "";

    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > MAX_STATUS_BYTES) return;

    setPendingFile(file);
  };

  const unseenCount = others.filter((bucket) => bucket.hasUnseen).length;
  const seenBuckets = others.filter((bucket) => !bucket.hasUnseen);
  const unseenBuckets = others.filter((bucket) => bucket.hasUnseen);

  const myStatusCount = mine?.statuses?.length || 0;

  return (
    <div className="flex flex-col">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">My status</p>
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          aria-label="Add status"
          onPress={() => fileInputRef.current?.click()}
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>

      <StatusRow
        name={authUser?.fullName || "You"}
        avatarUrl={authUser?.profilePic}
        hasStatus={myStatusCount > 0}
        hasUnseen={false}
        subtitle={
          myStatusCount > 0
            ? `${myStatusCount} update${myStatusCount === 1 ? "" : "s"} · ${formatTimeAgo(mine.lastStatusAt)}`
            : "Tap to share a photo"
        }
        onOpen={() =>
          myStatusCount > 0
            ? openStatusViewer(mine.userId)
            : fileInputRef.current?.click()
        }
        trailing={
          myStatusCount === 0 ? (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <PlusIcon className="size-4" />
            </span>
          ) : null
        }
      />

      {isStatusLoading && others.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted">Loading statuses...</p>
      ) : others.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted">
          No status updates from your contacts yet.
        </p>
      ) : (
        <>
          {unseenBuckets.length > 0 ? (
            <>
              <p className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">
                Recent updates {unseenCount > 0 ? `(${unseenCount} new)` : ""}
              </p>
              {unseenBuckets.map((bucket) => (
                <StatusRow
                  key={bucket.userId}
                  name={bucket.fullName}
                  avatarUrl={bucket.profilePic}
                  hasStatus
                  hasUnseen
                  subtitle={formatTimeAgo(bucket.lastStatusAt)}
                  onOpen={() => openStatusViewer(bucket.userId)}
                />
              ))}
            </>
          ) : null}

          {seenBuckets.length > 0 ? (
            <>
              <p className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">
                Viewed
              </p>
              {seenBuckets.map((bucket) => (
                <StatusRow
                  key={bucket.userId}
                  name={bucket.fullName}
                  avatarUrl={bucket.profilePic}
                  hasStatus
                  hasUnseen={false}
                  subtitle={formatTimeAgo(bucket.lastStatusAt)}
                  onOpen={() => openStatusViewer(bucket.userId)}
                />
              ))}
            </>
          ) : null}
        </>
      )}

      {pendingFile ? (
        <StatusComposer
          file={pendingFile}
          onCancel={() => setPendingFile(null)}
          onPosted={() => setPendingFile(null)}
        />
      ) : null}
    </div>
  );
}
