import { useState } from "react";
import { Avatar, Button } from "@heroui/react";
import { LinkIcon, LoaderIcon, MessageCircleIcon, SearchIcon } from "lucide-react";
import toast from "react-hot-toast";
import { useChatStore } from "../../store/useChatStore";
import { useAuthStore } from "../../store/useAuthStore";
import { getInitials } from "../../hooks/useSelectedConversation";

// Replaces the old "browse every user" list. There's no directory any
// more — you find someone by their exact email, or they find you through
// a share link. Both paths only ever reveal one profile at a time.
export function UserSearchPanel({ onOpenConversation }) {
  const authUser = useAuthStore((state) => state.authUser);

  const userSearchQuery = useChatStore((state) => state.userSearchQuery);
  const setUserSearchQuery = useChatStore((state) => state.setUserSearchQuery);
  const isSearchingUser = useChatStore((state) => state.isSearchingUser);
  const userSearchResult = useChatStore((state) => state.userSearchResult);
  const userSearchError = useChatStore((state) => state.userSearchError);
  const searchUserByEmail = useChatStore((state) => state.searchUserByEmail);
  const clearUserSearch = useChatStore((state) => state.clearUserSearch);

  const [hasSearched, setHasSearched] = useState(false);

  const inviteLink = authUser?._id
    ? `${window.location.origin}/invite/${authUser._id}`
    : "";

  const handleSearch = async (event) => {
    event.preventDefault();
    const trimmed = userSearchQuery.trim();
    if (!trimmed || isSearchingUser) return;
    setHasSearched(true);
    await searchUserByEmail(trimmed);
  };

  const handleQueryChange = (event) => {
    setUserSearchQuery(event.target.value);
    if (hasSearched) setHasSearched(false);
    if (userSearchResult || userSearchError) clearUserSearch();
  };

  const handleCopyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy the link — copy it manually");
    }
  };

  const handleMessage = () => {
    if (!userSearchResult) return;
    onOpenConversation(userSearchResult._id);
    clearUserSearch();
    setUserSearchQuery("");
  };

  return (
    <div className="flex flex-col gap-4 px-3 py-3">
      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
          Find someone by email
        </p>
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            value={userSearchQuery}
            onChange={handleQueryChange}
            placeholder="name@example.com"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-accent"
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isIconOnly
            isDisabled={!userSearchQuery.trim() || isSearchingUser}
            aria-label="Search"
          >
            {isSearchingUser ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              <SearchIcon className="size-4" />
            )}
          </Button>
        </form>

        <div className="mt-2">
          {isSearchingUser ? null : userSearchError && hasSearched ? (
            <p className="text-xs text-muted">
              {userSearchError}. Ask them to share their invite link instead.
            </p>
          ) : userSearchResult ? (
            <button
              type="button"
              onClick={handleMessage}
              className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-left"
            >
              <Avatar className="size-10 shrink-0">
                <Avatar.Image alt={userSearchResult.fullName} src={userSearchResult.profilePic} />
                <Avatar.Fallback className="text-sm font-medium">
                  {getInitials(userSearchResult.fullName)}
                </Avatar.Fallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{userSearchResult.fullName}</p>
                <p className="truncate text-xs text-muted">{userSearchResult.email}</p>
              </div>
              <MessageCircleIcon className="size-4.5 shrink-0 text-accent" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      <div className="border-t border-border pt-3">
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
          Or invite someone
        </p>
        <p className="mb-2 text-xs text-muted">
          Share your link — anyone who opens it can message you directly.
        </p>
        <Button variant="ghost" fullWidth className="justify-start" onPress={handleCopyInviteLink}>
          <LinkIcon className="size-4 shrink-0" aria-hidden />
          <span className="truncate">Copy invite link</span>
        </Button>
      </div>
    </div>
  );
}
