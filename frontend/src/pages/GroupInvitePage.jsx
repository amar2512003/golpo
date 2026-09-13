import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router";
import { Avatar, Button } from "@heroui/react";
import { LoaderIcon } from "lucide-react";
import { useGroupStore } from "../store/useGroupStore";
import { getInitials } from "../hooks/useSelectedConversation";
import { AppLogo, APP_NAME } from "../components/AppLogo";
import PageLoader from "../components/PageLoader";

// Landing spot for a group's "Invite via link" share (see GroupInfoModal).
// Unlike the DM invite link, this shows a brief about the group first —
// joining a group is a real, visible membership change, not just opening
// a chat — and lets the person confirm before they're added.
function GroupInvitePage() {
  const { inviteCode } = useParams();
  const getGroupInvitePreview = useGroupStore((state) => state.getGroupInvitePreview);
  const joinGroupByInviteCode = useGroupStore((state) => state.joinGroupByInviteCode);
  const setActiveGroupId = useGroupStore((state) => state.setActiveGroupId);

  const [preview, setPreview] = useState(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [joinedGroupId, setJoinedGroupId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await getGroupInvitePreview(inviteCode);
      if (!cancelled) {
        setPreview(result);
        setIsLoadingPreview(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [inviteCode, getGroupInvitePreview]);

  const handleJoin = async () => {
    setIsJoining(true);
    const group = await joinGroupByInviteCode(inviteCode);
    setIsJoining(false);
    if (group) {
      setActiveGroupId(group._id);
      setJoinedGroupId(group._id);
    }
  };

  if (isLoadingPreview) return <PageLoader />;

  if (joinedGroupId) return <Navigate to="/" replace />;

  const isValid = preview && !preview.error;
  const memberLabel = isValid
    ? `${preview.memberCount} member${preview.memberCount === 1 ? "" : "s"}`
    : "";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 text-center text-foreground">
        <AppLogo size={40} className="mx-auto mb-4 size-10 rounded-[11px]" alt="" />

        {!isValid ? (
          <>
            <p className="mb-1 text-[17px] font-semibold">Invite not available</p>
            <p className="mb-5 text-sm text-muted">
              {preview?.error || "This invite link is no longer valid."}
            </p>
            <Button as="a" href="/" variant="primary" fullWidth>
              Go to {APP_NAME}
            </Button>
          </>
        ) : (
          <>
            <Avatar className="mx-auto mb-3 size-16">
              <Avatar.Image alt={preview.name} src={preview.groupPic} />
              <Avatar.Fallback className="text-xl">{getInitials(preview.name)}</Avatar.Fallback>
            </Avatar>

            <p className="text-[17px] font-semibold">{preview.name}</p>
            <p className="mb-3 text-xs text-muted">
              {memberLabel}
              {preview.createdByName ? ` · Created by ${preview.createdByName}` : ""}
            </p>

            {preview.description ? (
              <p className="mb-5 rounded-xl bg-surface px-3 py-2 text-sm text-foreground">
                {preview.description}
              </p>
            ) : (
              <p className="mb-5 text-sm text-muted">
                You've been invited to join this group on {APP_NAME}.
              </p>
            )}

            {preview.isMember ? (
              <Button variant="primary" fullWidth onPress={handleJoin} isDisabled={isJoining}>
                {isJoining ? <LoaderIcon className="size-4 animate-spin" aria-hidden /> : null}
                Open group
              </Button>
            ) : preview.isFull ? (
              <>
                <p className="mb-3 text-xs font-medium text-red-500">
                  This group is full ({preview.maxMembers} member cap).
                </p>
                <Button as="a" href="/" variant="ghost" fullWidth>
                  Go to {APP_NAME}
                </Button>
              </>
            ) : (
              <Button variant="primary" fullWidth onPress={handleJoin} isDisabled={isJoining}>
                {isJoining ? <LoaderIcon className="size-4 animate-spin" aria-hidden /> : null}
                Join group
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default GroupInvitePage;
