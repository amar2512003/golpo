export function formatMessageTime(date) {
  return new Date(date).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Returns a day-separator label for a message's createdAt: "Today",
// "Yesterday", or a locale date string for anything older.
export function formatMessageDate(date) {
  const d = new Date(date);
  const now = new Date();

  if (isSameDay(d, now)) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return "Yesterday";

  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

// Returns a stable per-day key (local date, not UTC) for grouping messages.
export function getDayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Compact timestamp for a sidebar row: just the clock time for today, a
// short weekday for the last week, otherwise a short date — mirrors how
// most chat apps keep the conversation list from getting noisy.
export function formatSidebarTime(date) {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();

  if (isSameDay(d, now)) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return "Yesterday";

  const withinLastWeek = now.getTime() - d.getTime() < 6 * 24 * 60 * 60 * 1000;
  if (withinLastWeek) return d.toLocaleDateString([], { weekday: "short" });

  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

// Turns a conversation's lastMessage (DM or group, same shape from the
// backend) into the one-line snippet shown under the name in the sidebar.
export function formatLastMessagePreview(lastMessage) {
  if (!lastMessage) return "";
  if (lastMessage.poll?.question) return "📊 Poll";
  if (lastMessage.image) return "📷 Photo";
  if (lastMessage.video) return "📹 Video";
  if (lastMessage.audio) return "🎤 Voice message";
  if (lastMessage.text) return lastMessage.text;
  return "";
}

// A single, non-global instance for testing individual segments — split()
// below uses its own (global, capturing) copy so the two never share
// mutable lastIndex state.
const IS_URL = /^https?:\/\/[^\s]+$/;

// Splits message text into plain-text and URL segments so bare links
// (e.g. the Google Maps link in a shared location) render as tappable
// anchors instead of dead text. Returns an array of strings and
// { type: "link", href, label } objects for the caller to render.
export function splitTextWithLinks(text) {
  if (!text) return [];

  // A capturing group in split() keeps the matched delimiters in the
  // result, alternating plain text and URL segments.
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.filter(Boolean).map((part) =>
    IS_URL.test(part) ? { type: "link", href: part, label: part } : part,
  );
}