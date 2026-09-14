import { useState } from "react";
import { Avatar, Button } from "@heroui/react";
import { LoaderIcon, SearchIcon, UsersIcon, XIcon } from "lucide-react";
import { useChatStore } from "../../store/useChatStore";
import { useGroupStore, MAX_GROUP_MEMBERS } from "../../store/useGroupStore";
import { getInitials } from "../../hooks/useSelectedConversation";

const MAX_OTHER_MEMBERS = MAX_GROUP_MEMBERS - 1; // the creator fills one slot

export function CreateGroupModal({ onClose }) {
  const conversations = useChatStore((state) => state.conversations);
  const createGroup = useGroupStore((state) => state.createGroup);

  const searchUserByEmail = useChatStore((state) => state.searchUserByEmail);

  const [name, setName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]); // full user objects, so we can render them without another lookup
  const [emailQuery, setEmailQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const selectedIds = selectedMembers.map((m) => m._id);
  const atCapacity = selectedIds.length >= MAX_OTHER_MEMBERS;

  // People you're already chatting with — the only "pick from a list"
  // option left. Anyone else has to be found by their exact email, same
  // as the Users tab, so this can't be used to browse the whole platform.
  const suggestedContacts = conversations.filter((user) => !selectedIds.includes(user._id));

  const addMember = (user) => {
    if (selectedIds.includes(user._id) || atCapacity) return;
    setSelectedMembers((prev) => [...prev, user]);
  };

  const removeMember = (userId) => {
    setSelectedMembers((prev) => prev.filter((m) => m._id !== userId));
  };

  const handleEmailSearch = async (event) => {
    event.preventDefault();
    const trimmed = emailQuery.trim();
    if (!trimmed || isSearching || atCapacity) return;

    setIsSearching(true);
    setError("");
    const found = await searchUserByEmail(trimmed);
    setIsSearching(false);

    if (!found) {
      setError("No user found with that email");
      return;
    }
    addMember(found);
    setEmailQuery("");
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Give the group a name");
      return;
    }
    if (selectedIds.length === 0) {
      setError("Add at least one other member");
      return;
    }

    setError("");
    setIsCreating(true);
    const group = await createGroup({ name: name.trim(), memberIds: selectedIds });
    setIsCreating(false);

    if (group) {
      onClose();
    } else {
      setError("Couldn't create the group. Try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <p className="text-[15px] font-semibold">New group</p>
          <Button variant="ghost" size="sm" isIconOnly onPress={onClose} aria-label="Close">
            <XIcon className="size-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Group name"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-accent"
          />

          <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-muted">
            Members ({selectedIds.length}/{MAX_OTHER_MEMBERS})
          </p>

          {selectedMembers.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {selectedMembers.map((member) => (
                <span
                  key={member._id}
                  className="flex items-center gap-1.5 rounded-full bg-accent-soft py-1 pl-1 pr-2 text-xs font-medium"
                >
                  <Avatar className="size-5">
                    <Avatar.Image alt={member.fullName} src={member.profilePic} />
                    <Avatar.Fallback className="text-[10px]">
                      {getInitials(member.fullName)}
                    </Avatar.Fallback>
                  </Avatar>
                  {member.fullName}
                  <button
                    type="button"
                    onClick={() => removeMember(member._id)}
                    aria-label={`Remove ${member.fullName}`}
                  >
                    <XIcon className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <form onSubmit={handleEmailSearch} className="mb-3 flex items-center gap-2">
            <input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              value={emailQuery}
              onChange={(event) => setEmailQuery(event.target.value)}
              placeholder="Add by email"
              disabled={atCapacity}
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
            />
            <Button
              type="submit"
              size="sm"
              isIconOnly
              isDisabled={!emailQuery.trim() || isSearching || atCapacity}
              aria-label="Find by email"
            >
              {isSearching ? (
                <LoaderIcon className="size-4 animate-spin" />
              ) : (
                <SearchIcon className="size-4" />
              )}
            </Button>
          </form>

          {suggestedContacts.length > 0 ? (
            <>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                Or add someone you already chat with
              </p>
              <div className="space-y-1">
                {suggestedContacts.map((user) => (
                  <button
                    key={user._id}
                    type="button"
                    disabled={atCapacity}
                    onClick={() => addMember(user)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left disabled:opacity-50"
                  >
                    <Avatar className="size-9 shrink-0">
                      <Avatar.Image alt={user.fullName} src={user.profilePic} />
                      <Avatar.Fallback className="text-xs font-medium">
                        {getInitials(user.fullName)}
                      </Avatar.Fallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                      {user.fullName}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {error ? <p className="mt-3 text-xs font-medium text-red-500">{error}</p> : null}
        </div>

        <div className="shrink-0 border-t border-border px-4 py-3">
          <Button variant="primary" fullWidth isDisabled={isCreating} onPress={handleCreate}>
            {isCreating ? (
              <>
                <LoaderIcon className="size-4 animate-spin" aria-hidden />
                Creating...
              </>
            ) : (
              <>
                <UsersIcon className="size-4" aria-hidden />
                Create group
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
