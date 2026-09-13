import { useState } from "react";
import { Avatar, Button } from "@heroui/react";
import { CheckIcon, LoaderIcon, UsersIcon, XIcon } from "lucide-react";
import { useChatStore } from "../../store/useChatStore";
import { useGroupStore, MAX_GROUP_MEMBERS } from "../../store/useGroupStore";
import { getInitials } from "../../hooks/useSelectedConversation";

const MAX_OTHER_MEMBERS = MAX_GROUP_MEMBERS - 1; // the creator fills one slot

export function CreateGroupModal({ onClose }) {
  const users = useChatStore((state) => state.users);
  const createGroup = useGroupStore((state) => state.createGroup);

  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const toggleMember = (userId) => {
    setSelectedIds((prev) => {
      if (prev.includes(userId)) return prev.filter((id) => id !== userId);
      if (prev.length >= MAX_OTHER_MEMBERS) return prev;
      return [...prev, userId];
    });
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
      <div className="flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground">
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

          <div className="space-y-1">
            {users.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">No other users to add yet.</p>
            ) : (
              users.map((user) => {
                const isSelected = selectedIds.includes(user._id);
                return (
                  <button
                    key={user._id}
                    type="button"
                    onClick={() => toggleMember(user._id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left ${
                      isSelected ? "bg-accent-soft" : ""
                    }`}
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
                    {isSelected ? (
                      <CheckIcon className="size-4 shrink-0 text-accent" aria-hidden />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

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
