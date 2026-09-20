// Voice-note helpers shared by the DM and group message controllers.

const MAX_VOICE_NOTE_SECONDS = 15 * 60;

// The duration arrives as a multipart text field ("12.4"), so it's a string
// (or missing). Anything that isn't a sane positive number is dropped rather
// than trusted — the player just falls back to the audio file's own metadata.
export function parseAudioDuration(value) {
  const seconds = Number.parseFloat(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.min(Math.round(seconds * 10) / 10, MAX_VOICE_NOTE_SECONDS);
}
