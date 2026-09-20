// Thin wrapper around the GIPHY API for the composer's GIF tab.
//
// Falls back to GIPHY's public beta key (used all over their own docs for
// demos/testing) so the picker works out of the box. It's rate-limited
// (42 requests/hour), so for real production traffic grab a free key at
// https://developers.giphy.com and set VITE_GIPHY_API_KEY in the frontend
// env — everything here already reads from it.
const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY || "dc6zaTOxFJmzC";
const GIPHY_GIFS_URL = "https://api.giphy.com/v1/gifs";
// Same GIPHY API, different collection: transparent, expression-style
// artwork (the actual "stickers" WhatsApp/Telegram send) instead of GIFs.
const GIPHY_STICKERS_URL = "https://api.giphy.com/v1/stickers";

async function giphyRequest(baseUrl, endpoint, params) {
  const url = new URL(`${baseUrl}/${endpoint}`);
  url.searchParams.set("api_key", GIPHY_API_KEY);
  url.searchParams.set("limit", "24");
  url.searchParams.set("rating", "pg-13");
  Object.entries(params || {}).forEach(([key, value]) => url.searchParams.set(key, value));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to load from GIPHY");

  const { data } = await res.json();
  return data.map((gif) => ({
    id: gif.id,
    // fixed_width is 200px wide — sharp enough for the picker's one-per-row
    // layout (the "_small" rendition is only 100px and looks blurry there).
    previewUrl:
      gif.images.fixed_width?.url ||
      gif.images.fixed_width_small?.url ||
      gif.images.fixed_height_small?.url,
    previewWidth: Number(gif.images.fixed_width?.width) || 200,
    previewHeight: Number(gif.images.fixed_width?.height) || 150,
    fullUrl: gif.images.original?.url || gif.images.fixed_height?.url,
    title: gif.title || "GIF",
  }));
}

export function fetchTrendingGifs() {
  return giphyRequest(GIPHY_GIFS_URL, "trending");
}

export function searchGifs(query) {
  return giphyRequest(GIPHY_GIFS_URL, "search", { q: query });
}

export function fetchTrendingStickers() {
  return giphyRequest(GIPHY_STICKERS_URL, "trending");
}

export function searchStickers(query) {
  return giphyRequest(GIPHY_STICKERS_URL, "search", { q: query });
}
