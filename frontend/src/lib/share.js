// Small helpers for building "share this invite" links. Kept framework-free
// so both the DM invite panel and the group invite modal can reuse them.

export function buildShareMessage({ text, url }) {
  return url ? `${text}\n${url}` : text;
}

export function buildWhatsAppShareUrl({ text, url }) {
  return `https://wa.me/?text=${encodeURIComponent(buildShareMessage({ text, url }))}`;
}

export function buildGmailShareUrl({ subject, text, url }) {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    su: subject,
    body: buildShareMessage({ text, url }),
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

export function canUseNativeShare() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}
