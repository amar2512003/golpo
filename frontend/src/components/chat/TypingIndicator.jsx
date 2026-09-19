import { useEffect, useRef, useState } from "react";

// Must match the goppo-typing-out duration in goppo-ui.css.
const EXIT_MS = 180;

/**
 * The "someone is typing" bubble: three bouncing dots that ease in when
 * `isVisible` turns true and ease out (rather than popping) when it turns
 * false. `label` is announced to screen readers; it's only shown as text
 * when `showLabel` is set (group chats, where you need to know who).
 */
export function TypingIndicator({ isVisible, label, showLabel = false }) {
  const [isExiting, setIsExiting] = useState(false);

  // Remember the last label so it doesn't blank out mid fade-out when the
  // last typer is removed from the list.
  const [shownLabel, setShownLabel] = useState(label);
  if (isVisible && label !== shownLabel) setShownLabel(label);

  // Keep the bubble mounted just long enough to play its exit animation —
  // but only if it was actually showing (not on the very first render).
  const wasVisibleRef = useRef(false);
  useEffect(() => {
    if (isVisible) {
      wasVisibleRef.current = true;
      setIsExiting(false);
      return;
    }
    if (!wasVisibleRef.current) return;

    wasVisibleRef.current = false;
    setIsExiting(true);
    const timer = setTimeout(() => setIsExiting(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [isVisible]);

  if (!isVisible && !isExiting) return null;

  return (
    <div
      className={`typing-row flex w-full justify-start ${
        isVisible ? "typing-enter" : "typing-exit"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="message-bubble typing-bubble rounded-2xl rounded-bl-md bg-surface">
        {showLabel ? (
          <p className="mb-1 text-[12px] font-semibold text-accent">{shownLabel}</p>
        ) : (
          <span className="sr-only">{shownLabel}</span>
        )}
        <div className="typing-dots" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
