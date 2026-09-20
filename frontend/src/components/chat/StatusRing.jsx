/**
 * Wraps an avatar in a story ring. Unseen statuses get a glowing orange
 * ring; once everything from that person has been watched it drops to a
 * flat grey one, and with no live status at all the avatar is rendered
 * untouched so nothing shifts in the layout.
 *
 * Purely presentational — it's used inside conversation rows, which are
 * themselves <button>s, so it must never render an interactive element.
 */
export function StatusRing({ hasStatus, hasUnseen, children, className = "" }) {
  if (!hasStatus) return children;

  return (
    <span
      className={`status-ring ${hasUnseen ? "status-ring--unseen" : "status-ring--seen"} ${className}`}
    >
      <span className="status-ring-inner">{children}</span>
      <span className="sr-only">{hasUnseen ? "Unseen status" : "Status seen"}</span>
    </span>
  );
}
