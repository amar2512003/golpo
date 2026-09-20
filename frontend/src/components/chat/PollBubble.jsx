import { CheckIcon, ListChecksIcon } from "lucide-react";
import { useAuthStore } from "../../store/useAuthStore";
import { useChatStore } from "../../store/useChatStore";
import { useGroupStore } from "../../store/useGroupStore";

// Renders a poll message: the question, each option as a tappable bar
// showing its share of the vote, and a check on whichever option the
// viewer picked. Voting again on the same option retracts it — the
// backend enforces single-choice per user.
export function PollBubble({ messageId, poll, isGroup, isOwnMessage }) {
  const authUserId = useAuthStore((state) => state.authUser?._id);
  const voteOnPoll = useChatStore((state) => state.voteOnPoll);
  const voteOnGroupPoll = useGroupStore((state) => state.voteOnGroupPoll);

  const totalVotes = poll.options.reduce((sum, option) => sum + (option.votes?.length || 0), 0);

  const handleVote = (optionIndex) => {
    if (isGroup) voteOnGroupPoll(messageId, optionIndex);
    else voteOnPoll(messageId, optionIndex);
  };

  return (
    <div className="mb-1.5 min-w-[14rem] max-w-full">
      <p className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold">
        <ListChecksIcon className="size-4 shrink-0" strokeWidth={2} aria-hidden />
        {poll.question}
      </p>
      <div className="flex flex-col gap-1.5">
        {poll.options.map((option, index) => {
          const voteCount = option.votes?.length || 0;
          const hasVotedHere = option.votes?.some((voterId) => String(voterId) === String(authUserId));
          const percent = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;

          return (
            <button
              key={index}
              type="button"
              onClick={() => handleVote(index)}
              className={`relative overflow-hidden rounded-lg border px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                isOwnMessage
                  ? "border-accent-foreground/25 hover:bg-accent-foreground/10"
                  : "border-border hover:bg-surface-secondary"
              }`}
            >
              <span
                className={`absolute inset-y-0 left-0 ${
                  isOwnMessage ? "bg-accent-foreground/15" : "bg-accent-soft"
                }`}
                style={{ width: `${percent}%` }}
                aria-hidden
              />
              <span className="relative flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  {hasVotedHere ? (
                    <CheckIcon className="size-3.5 shrink-0 text-accent" strokeWidth={3} aria-hidden />
                  ) : null}
                  <span className="truncate">{option.text}</span>
                </span>
                <span className="shrink-0 text-[11px] tabular-nums opacity-70">
                  {voteCount} {voteCount === 1 ? "vote" : "votes"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p
        className={`mt-1.5 text-[11px] ${isOwnMessage ? "text-accent-foreground/75" : "text-muted"}`}
      >
        {totalVotes} {totalVotes === 1 ? "vote" : "votes"} total
      </p>
    </div>
  );
}
