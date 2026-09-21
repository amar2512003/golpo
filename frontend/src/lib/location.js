// Shared-location helpers.
//
// A shared location is still an ordinary text message — no schema or API
// change — shaped like:
//
//   📍 My location: https://www.google.com/maps/search/?api=1&query=LAT,LNG
//
// The chat bubble recognises that shape and renders a map card instead of
// the raw link (see LocationCard). Older messages that used the shorter
// `maps?q=LAT,LNG` form are recognised too, so history keeps working.

const LOCATION_LABEL = "📍 My location:";

export const MAP_ZOOM = 15; // street level

// Coordinates are trimmed to 6 decimals (~10 cm) — plenty for a map pin,
// and it keeps the message text short.
const round = (value) => Number(value.toFixed(6));

/** The link the card opens. Always rebuilt from numbers, never taken from message text. */
export function getGoogleMapsUrl(latitude, longitude) {
  return `https://www.google.com/maps/search/?api=1&query=${round(latitude)},${round(longitude)}`;
}

/** Message text to send for a shared position. */
export function buildLocationMessageText(latitude, longitude) {
  return `${LOCATION_LABEL} ${getGoogleMapsUrl(latitude, longitude)}`;
}

/**
 * The card's live preview. Google's `output=embed` form doesn't need an
 * API key/billing (unlike the Maps JavaScript, Static Maps or Tiles
 * APIs) — it's just the same iframe Google itself uses for "embed a map"
 * on any website. It's undocumented and unsupported, so it could change
 * or stop working without notice; if that ever happens, swap this for a
 * keyless raster-tile provider instead (OpenStreetMap, Esri, ...).
 */
export function getGoogleMapsEmbedUrl(latitude, longitude, zoom = MAP_ZOOM) {
  const query = `${round(latitude)},${round(longitude)}`;
  return `https://www.google.com/maps?q=${query}&z=${zoom}&output=embed`;
}

const LOCATION_TEXT_REGEX =
  /^\u{1F4CD} My location:\s*https?:\/\/(?:www\.)?google\.com\/maps\S*?[?&](?:q|query)=(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)\s*$/u;

/**
 * Returns { latitude, longitude, href } if `text` is a shared-location
 * message, otherwise null. `href` is rebuilt from the parsed numbers, so a
 * hand-crafted message can't make the card link anywhere but Google Maps.
 */
export function parseLocationMessage(text) {
  if (!text) return null;

  const match = LOCATION_TEXT_REGEX.exec(text.trim());
  if (!match) return null;

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!(Math.abs(latitude) <= 90) || !(Math.abs(longitude) <= 180)) return null;

  return { latitude, longitude, href: getGoogleMapsUrl(latitude, longitude) };
}

/** 22.653026, 88.344042 -> "22.6530° N, 88.3440° E" */
export function formatCoordinates(latitude, longitude) {
  const lat = `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? "N" : "S"}`;
  const lng = `${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? "E" : "W"}`;
  return `${lat}, ${lng}`;
}
