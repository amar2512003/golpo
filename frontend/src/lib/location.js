// Location messages are sent as plain text in this shape:
//
//   📍 My location: https://www.google.com/maps?q=22.6530,88.3440
//
// Rather than change how they're stored/sent (and leave every message
// already in the database as a raw link), the chat recognises that
// format at render time and draws a map card instead. Anything that
// doesn't match exactly falls through to normal text rendering.
const LOCATION_MESSAGE_REGEX =
  /^\s*(?:\p{Extended_Pictographic}\uFE0F?\s*)?My location:\s*https?:\/\/(?:www\.)?google\.com\/maps\?q=(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)\s*$/iu;

// Returns { lat, lng, url } for a location message, or null for anything else.
export function parseLocationMessage(text) {
  if (!text) return null;

  const match = LOCATION_MESSAGE_REGEX.exec(text);
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return {
    lat,
    lng,
    // Rebuilt from the parsed numbers rather than reusing the text, so
    // the link we render is always a well-formed Google Maps URL.
    url: `https://www.google.com/maps?q=${lat},${lng}`,
  };
}

export const TILE_SIZE = 256;

// Web-Mercator: lat/lng -> pixel position on the whole-world map at a
// given zoom (the same maths every slippy-map tile server uses).
export function latLngToWorldPixel(lat, lng, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const sinLat = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);

  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

// The 3x3 block of map tiles around a point, plus where inside that
// block the point sits — enough to draw a static map with the location
// dead-centre using nothing but <img> tags (no map library, no API key).
export function getTileGrid(lat, lng, zoom) {
  const { x, y } = latLngToWorldPixel(lat, lng, zoom);
  const tilesPerSide = 2 ** zoom;

  const centerTileX = Math.floor(x / TILE_SIZE);
  const centerTileY = Math.floor(y / TILE_SIZE);

  const tiles = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const tileY = centerTileY + row - 1;
      if (tileY < 0 || tileY >= tilesPerSide) continue; // off the top/bottom of the world

      // Longitude wraps around the date line.
      const tileX = (((centerTileX + col - 1) % tilesPerSide) + tilesPerSide) % tilesPerSide;
      tiles.push({ row, col, url: `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png` });
    }
  }

  return {
    tiles,
    // The point's position within the 768x768 block.
    pointX: TILE_SIZE + (x - centerTileX * TILE_SIZE),
    pointY: TILE_SIZE + (y - centerTileY * TILE_SIZE),
  };
}

export function formatCoordinates(lat, lng) {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
