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

// ---------------------------------------------------------------------------
// Map preview tiles
//
// Instead of asking a static-map service for one image (they need API keys
// or go down), the card lays out a few standard 256px "slippy map" tiles
// itself and centres the pin on the shared point.
// https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
// ---------------------------------------------------------------------------

export const TILE_SIZE = 256;
export const MAP_ZOOM = 15; // street level

// CARTO's free basemaps (OpenStreetMap data): a dark style for dark mode
// and the clean "Voyager" style for light mode. Swap these two templates
// to change map provider — nothing else depends on them.
const TILE_URLS = {
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  light: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
};

export function getTileUrl(theme, { x, y, z }) {
  const retina = typeof window !== "undefined" && window.devicePixelRatio > 1 ? "@2x" : "";
  const subdomain = "abcd"[(x + y) % 4];

  return (TILE_URLS[theme] ?? TILE_URLS.light)
    .replace("{s}", subdomain)
    .replace("{z}", z)
    .replace("{x}", x)
    .replace("{y}", y)
    .replace("{r}", retina);
}

/**
 * Which tiles cover a `width` x `height` viewport centred on the point, and
 * where each sits relative to that centre (`left` / `top`, in CSS pixels).
 */
export function getTileLayout(latitude, longitude, width, height, zoom = MAP_ZOOM) {
  const tileCount = 2 ** zoom;
  const latRad = (Math.max(-85.0511, Math.min(85.0511, latitude)) * Math.PI) / 180;

  // The point's position on the whole-world pixel grid at this zoom.
  const worldX = ((longitude + 180) / 360) * tileCount * TILE_SIZE;
  const worldY =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * tileCount * TILE_SIZE;

  const firstCol = Math.floor((worldX - width / 2) / TILE_SIZE);
  const lastCol = Math.floor((worldX + width / 2) / TILE_SIZE);
  const firstRow = Math.floor((worldY - height / 2) / TILE_SIZE);
  const lastRow = Math.floor((worldY + height / 2) / TILE_SIZE);

  const tiles = [];
  for (let row = firstRow; row <= lastRow; row++) {
    if (row < 0 || row >= tileCount) continue; // off the top/bottom of the world
    for (let col = firstCol; col <= lastCol; col++) {
      tiles.push({
        key: `${col}:${row}`,
        x: ((col % tileCount) + tileCount) % tileCount, // wrap across the antimeridian
        y: row,
        z: zoom,
        left: col * TILE_SIZE - worldX,
        top: row * TILE_SIZE - worldY,
      });
    }
  }

  return tiles;
}
