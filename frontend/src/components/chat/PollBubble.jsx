import { useMemo } from "react";
import { CheckIcon, ListChecksIcon } from "lucide-react";
import { useAuthStore } from "../../store/useAuthStore";
import { useChatStore } from "../../store/useChatStore";
import { useGroupStore } from "../../store/useGroupStore";


// One colour per option, shared by the pie slices, the legend and the
// "who voted" list so they read as a single key. Bright enough to stay
// visible on both the accent (own) and surface (others') bubble.
const OPTION_COLORS = [
  "#fbbf24",
  "#34d399",
  "#f472b6",
  "#38bdf8",
  "#a78bfa",
  "#fb923c",
  "#a3e635",
  "#f87171",
  "#2dd4bf",
  "#e879f9",
];
const optionColor = (index) => OPTION_COLORS[index % OPTION_COLORS.length];

const PIE_RADIUS = 44;
const PIE_CENTER = 50;

function polarPoint(angle) {
  return [
    PIE_CENTER + PIE_RADIUS * Math.cos(angle),
    PIE_CENTER + PIE_RADIUS * Math.sin(angle),
  ];
}

// Pie of the vote split. Options with no votes get no slice; a single
// option holding every vote is a full circle (an SVG arc can't draw that).
function PollPie({ slices, totalVotes }) {
  let startAngle = -Math.PI / 2;

  return (
    <svg viewBox="0 0 100 100" className="size-24 shrink-0" role="img" aria-label="Vote distribution">
      {slices.map(({ index, text, count }) => {
        const fraction = count / totalVotes;
        const label = `${text}: ${count} ${count === 1 ? "vote" : "votes"}`;

        if (fraction >= 0.9999) {
          return (
            <circle key={index} cx={PIE_CENTER} cy={PIE_CENTER} r={PIE_RADIUS} fill={optionColor(index)}>
              <title>{label}</title>
            </circle>
          );
        }

        const endAngle = startAngle + fraction * Math.PI * 2;
        const [x1, y1] = polarPoint(startAngle);
        const [x2, y2] = polarPoint(endAngle);
        const largeArc = fraction > 0.5 ? 1 : 0;
        startAngle = endAngle;

        return (
          <path
            key={index}
            d={`M ${PIE_CENTER} ${PIE_CENTER} L ${x1} ${y1} A ${PIE_RADIUS} ${PIE_RADIUS} 0 ${largeArc} 1 ${x2} ${y2} Z`}
            fill={optionColor(index)}
            stroke="rgba(0,0,0,0.25)"
            strokeWidth="0.75"
            strokeLinejoin="round"
          >
            <title>{label}</title>
          </path>
        );
      })}
    </svg>
  );
}

// Renders a poll message: the question, each option as a tappable bar
// showing its share of the vote, and a check on whichever option the
// viewer picked. Voting again on the same option retracts it — the
// backend enforces single-choice per user.
export function PollBubble({ messageId, poll, isGroup, isOwnMessage }) {
  const authUserId = useAuthStore((state) => state.authUser?._id);
  const voteOnPoll = useChatStore((state) => state.voteOnPoll);
  const voteOnGroupPoll = useGroupStore((state) => state.voteOnGroupPoll);

  const authUser = useAuthStore((state) => state.authUser);
  const selectedUser = useChatStore((state) => state.selectedUser);
  const groups = useGroupStore((state) => state.groups);
  const activeGroupId = useGroupStore((state) => state.activeGroupId);

  const totalVotes = poll.options.reduce((sum, option) => sum + (option.votes?.length || 0), 0);

  // Votes are stored as user ids, so build an id -> name lookup from
  // whoever can be in this thread: the group's members, or me + the peer.
  const nameById = useMemo(() => {
    const map = new Map();
    if (isGroup) {
      const group = groups.find((g) => String(g._id) === String(activeGroupId));
      group?.members?.forEach((member) => map.set(String(member._id), member.fullName));
    } else if (selectedUser) {
      map.set(String(selectedUser._id), selectedUser.fullName);
    }
    if (authUser?._id) map.set(String(authUser._id), "You");
    return map;
  }, [isGroup, groups, activeGroupId, selectedUser, authUser]);

  const votedOptions = poll.options
    .map((option, index) => ({
      index,
      text: option.text,
      count: option.votes?.length || 0,
      voters: (option.votes || []).map((voterId) => nameById.get(String(voterId)) || "Someone"),
    }))
    .filter((option) => option.count > 0);

  const mutedText = isOwnMessage ? "text-accent-foreground/75" : "text-muted";
  const panelBorder = isOwnMessage ? "border-accent-foreground/25" : "border-border";

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
      {totalVotes > 0 ? (
        <div className={`mt-2 rounded-lg border p-2.5 ${panelBorder}`}>
          <div className="flex items-center gap-3">
            <PollPie slices={votedOptions} totalVotes={totalVotes} />
            <ul className="flex min-w-0 flex-1 flex-col gap-1 text-[12px]">
              {poll.options.map((option, index) => {
                const count = option.votes?.length || 0;
                return (
                  <li key={index} className="flex items-center gap-1.5">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: optionColor(index) }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{option.text}</span>
                    <span className="shrink-0 tabular-nums opacity-80">
                      {Math.round((count / totalVotes) * 100)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className={`mt-2.5 flex flex-col gap-1.5 border-t pt-2 ${panelBorder}`}>
            <p className={`text-[11px] font-medium uppercase tracking-wide ${mutedText}`}>Who voted</p>
            {votedOptions.map((option) => (
              <p key={option.index} className="text-[12px] leading-snug">
                <span
                  className="mr-1.5 inline-block size-2 rounded-full align-middle"
                  style={{ backgroundColor: optionColor(option.index) }}
                  aria-hidden
                />
                <span className="font-semibold">{option.text}</span>
                <span className={mutedText}> — {option.voters.join(", ")}</span>
              </p>
            ))}
          </div>
        </div>
      ) : null}
      <p className={`mt-1.5 text-[11px] ${mutedText}`}>
        {totalVotes} {totalVotes === 1 ? "vote" : "votes"} total
      </p>
    </div>
  );
}
