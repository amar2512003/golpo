import { useRef, useState } from "react";
import { Avatar, Button, TextArea } from "@heroui/react";
import {
  CameraIcon,
  CheckIcon,
  LoaderIcon,
  LogOutIcon,
  PencilIcon,
  SearchIcon,
  ShieldIcon,
  TrashIcon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";
import { useChatStore } from "../../store/useChatStore";
import { useGroupStore, MAX_GROUP_MEMBERS } from "../../store/useGroupStore";
import { useAuthStore } from "../../store/useAuthStore";
import { getInitials } from "../../hooks/useSelectedConversation";

function idOf(refOrId) {
  return String(refOrId?._id || refOrId || "");
}

export function GroupInfoModal({ groupId, onClose }) {
  const group = useGroupStore((state) => state.groups.find((g) => g._id === groupId));
  const isUpdatingGroup = useGroupStore((state) => state.isUpdatingGroup);
  const updateGroupDetails = useGroupStore((state) => state.updateGroupDetails);
  const makeAdmin = useGroupStore((state) => state.makeAdmin);
  const addGroupMembers = useGroupStore((state) => state.addGroupMembers);
  const removeGroupMember = useGroupStore((state) => state.removeGroupMember);
  const leaveGroupById = useGroupStore((state) => state.leaveGroupById);
  const deleteGroupById = useGroupStore((state) => state.deleteGroupById);

  const conversations = useChatStore((state) => state.conversations);
  const searchUserByEmail = useChatStore((state) => state.searchUserByEmail);
  const authUser = useAuthStore((state) => state.authUser);

  const picInputRef = useRef(null);

  const [view, setView] = useState("info"); // "info" | "addMembers"
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [selectedNewMembers, setSelectedNewMembers] = useState([]); // full user objects
  const [emailQuery, setEmailQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [isAddingMembers, setIsAddingMembers] = useState(false);

  // The group can vanish out from under this modal (deleted, or we/the
  // last member left) while it's still open — just render nothing rather
  // than crash on missing fields; the parent closes it once
  // activeConversation goes null.
  if (!group) return null;

  const isAdmin = idOf(group.admin) === idOf(authUser?._id);
  const memberIds = new Set(group.members.map((m) => idOf(m)));
  const selectedNewMemberIds = selectedNewMembers.map((m) => m._id);
  const remainingSlots = MAX_GROUP_MEMBERS - group.members.length;
  const atCapacity = selectedNewMemberIds.length >= remainingSlots;

  // Same rule as everywhere else now: you can only add someone by their
  // exact email, or pick from people you already have a DM with — no
  // browsing the full user base.
  const suggestedContacts = conversations.filter(
    (user) => !memberIds.has(idOf(user._id)) && !selectedNewMemberIds.includes(user._id),
  );

  const startEditingName = () => {
    setNameDraft(group.name);
    setIsEditingName(true);
  };

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === group.name) {
      setIsEditingName(false);
      return;
    }
    const updated = await updateGroupDetails(groupId, { name: trimmed });
    if (updated) setIsEditingName(false);
  };

  const startEditingDescription = () => {
    setDescriptionDraft(group.description || "");
    setIsEditingDescription(true);
  };

  const saveDescription = async () => {
    const trimmed = descriptionDraft.trim();
    if (trimmed === (group.description || "")) {
      setIsEditingDescription(false);
      return;
    }
    const updated = await updateGroupDetails(groupId, { description: trimmed });
    if (updated) setIsEditingDescription(false);
  };

  const handlePicChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await updateGroupDetails(groupId, { groupPicFile: file });
  };

  const addNewMember = (user) => {
    if (memberIds.has(idOf(user._id)) || selectedNewMemberIds.includes(user._id) || atCapacity) return;
    setSelectedNewMembers((prev) => [...prev, user]);
  };

  const removeNewMember = (userId) => {
    setSelectedNewMembers((prev) => prev.filter((m) => m._id !== userId));
  };

  const handleEmailSearch = async (event) => {
    event.preventDefault();
    const trimmed = emailQuery.trim();
    if (!trimmed || isSearching || atCapacity) return;

    setIsSearching(true);
    setSearchError("");
    const found = await searchUserByEmail(trimmed);
    setIsSearching(false);

    if (!found) {
      setSearchError("No user found with that email");
      return;
    }
    if (memberIds.has(idOf(found._id))) {
      setSearchError(`${found.fullName} is already in this group`);
      return;
    }
    addNewMember(found);
    setEmailQuery("");
  };

  const handleAddMembers = async () => {
    if (selectedNewMemberIds.length === 0) return;
    setIsAddingMembers(true);
    const updated = await addGroupMembers(groupId, selectedNewMemberIds);
    setIsAddingMembers(false);
    if (updated) {
      setSelectedNewMembers([]);
      setView("info");
    }
  };

  const handleRemoveMember = (memberId, memberName) => {
    if (!window.confirm(`Remove ${memberName} from the group?`)) return;
    removeGroupMember(groupId, memberId);
  };

  const handleMakeAdmin = (memberId, memberName) => {
    if (
      !window.confirm(
        `Make ${memberName} the group admin? You'll no longer be able to manage the group.`,
      )
    ) {
      return;
    }
    makeAdmin(groupId, memberId);
  };

  const handleLeave = async () => {
    if (!window.confirm("Leave this group?")) return;
    const didLeave = await leaveGroupById(groupId);
    if (didLeave) onClose();
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this group for everyone? This can't be undone.")) return;
    const didDelete = await deleteGroupById(groupId);
    if (didDelete) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <p className="text-[15px] font-semibold">
            {view === "addMembers" ? "Add members" : "Group info"}
          </p>
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            onPress={view === "addMembers" ? () => setView("info") : onClose}
            aria-label="Close"
          >
            <XIcon className="size-5" />
          </Button>
        </div>

        {view === "addMembers" ? (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                Members ({selectedNewMemberIds.length}/{remainingSlots})
              </p>

              {selectedNewMembers.length > 0 ? (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {selectedNewMembers.map((member) => (
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
                        onClick={() => removeNewMember(member._id)}
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
              {searchError ? <p className="mb-3 text-xs font-medium text-red-500">{searchError}</p> : null}

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
                        onClick={() => addNewMember(user)}
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
            </div>
            <div className="shrink-0 border-t border-border px-4 py-3">
              <Button
                variant="primary"
                fullWidth
                isDisabled={isAddingMembers || selectedNewMemberIds.length === 0}
                onPress={handleAddMembers}
              >
                {isAddingMembers ? (
                  <LoaderIcon className="size-4 animate-spin" aria-hidden />
                ) : (
                  <UserPlusIcon className="size-4" aria-hidden />
                )}
                Add {selectedNewMemberIds.length > 0 ? selectedNewMemberIds.length : ""} member
                {selectedNewMemberIds.length === 1 ? "" : "s"}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="flex flex-col items-center gap-2">
              <div className="relative">
                <Avatar className="size-20">
                  <Avatar.Image alt={group.name} src={group.groupPic} />
                  <Avatar.Fallback className="text-2xl">
                    {getInitials(group.name)}
                  </Avatar.Fallback>
                </Avatar>
                {isAdmin ? (
                  <>
                    <input
                      ref={picInputRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={handlePicChange}
                    />
                    <button
                      type="button"
                      onClick={() => picInputRef.current?.click()}
                      disabled={isUpdatingGroup}
                      className="absolute bottom-0 right-0 flex size-7 items-center justify-center rounded-full bg-accent text-white shadow"
                      aria-label="Change group photo"
                    >
                      <CameraIcon className="size-3.5" />
                    </button>
                  </>
                ) : null}
              </div>

              {isEditingName ? (
                <div className="flex w-full items-center gap-2">
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && saveName()}
                    className="flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-center text-[15px] font-semibold outline-none focus:ring-2 focus:ring-accent"
                  />
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    onPress={saveName}
                    aria-label="Save name"
                  >
                    <CheckIcon className="size-4" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={isAdmin ? startEditingName : undefined}
                  className="flex items-center gap-1.5"
                  disabled={!isAdmin}
                >
                  <p className="text-[17px] font-semibold">{group.name}</p>
                  {isAdmin ? <PencilIcon className="size-3.5 text-muted" aria-hidden /> : null}
                </button>
              )}

              <p className="text-xs text-muted">
                {group.members.length} member{group.members.length === 1 ? "" : "s"} · Created by{" "}
                {idOf(group.createdBy) === idOf(authUser?._id)
                  ? "you"
                  : group.createdBy?.fullName || "a former member"}
              </p>
            </div>

            <div className="mt-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                Description
              </p>
              {isEditingDescription ? (
                <div className="space-y-2">
                  <TextArea
                    autoFocus
                    fullWidth
                    rows={3}
                    value={descriptionDraft}
                    onChange={(event) => setDescriptionDraft(event.target.value)}
                    placeholder="Add a description"
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onPress={() => setIsEditingDescription(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" variant="primary" onPress={saveDescription}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={isAdmin ? startEditingDescription : undefined}
                  className="block w-full rounded-xl bg-surface px-3 py-2 text-left text-sm text-foreground disabled:text-muted"
                  disabled={!isAdmin}
                >
                  {group.description || (isAdmin ? "Add a description" : "No description yet")}
                </button>
              )}
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Members ({group.members.length}/{MAX_GROUP_MEMBERS})
                </p>
                {isAdmin && remainingSlots > 0 ? (
                  <button
                    type="button"
                    onClick={() => setView("addMembers")}
                    className="flex items-center gap-1 text-xs font-medium text-accent"
                  >
                    <UserPlusIcon className="size-3.5" aria-hidden /> Add
                  </button>
                ) : null}
              </div>

              <div className="space-y-1">
                {group.members.map((member) => {
                  const memberIsAdmin = idOf(group.admin) === idOf(member._id);
                  const isSelf = idOf(member._id) === idOf(authUser?._id);

                  return (
                    <div key={member._id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                      <Avatar className="size-9 shrink-0">
                        <Avatar.Image alt={member.fullName} src={member.profilePic} />
                        <Avatar.Fallback className="text-xs font-medium">
                          {getInitials(member.fullName)}
                        </Avatar.Fallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium">
                          {isSelf ? "You" : member.fullName}
                        </p>
                        {memberIsAdmin ? <p className="text-xs text-accent">Admin</p> : null}
                      </div>
                      {isAdmin && !isSelf ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            isIconOnly
                            onPress={() => handleMakeAdmin(member._id, member.fullName)}
                            aria-label={`Make ${member.fullName} admin`}
                          >
                            <ShieldIcon className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            isIconOnly
                            onPress={() => handleRemoveMember(member._id, member.fullName)}
                            aria-label={`Remove ${member.fullName}`}
                          >
                            <XIcon className="size-4 text-red-500" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 space-y-1 border-t border-border pt-4">
              <Button
                variant="ghost"
                fullWidth
                className="justify-start text-red-500"
                onPress={handleLeave}
              >
                <LogOutIcon className="size-4" aria-hidden /> Leave group
              </Button>
              {isAdmin ? (
                <Button
                  variant="ghost"
                  fullWidth
                  className="justify-start text-red-500"
                  onPress={handleDelete}
                >
                  <TrashIcon className="size-4" aria-hidden /> Delete group
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
