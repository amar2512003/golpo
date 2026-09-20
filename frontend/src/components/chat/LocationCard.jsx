import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { useTheme } from "../../context/theme";
import {
  TILE_SIZE,
  formatCoordinates,
  getTileLayout,
  getTileUrl,
} from "../../lib/location";

// The card is at most 18rem (288px) wide; lay out tiles for a slightly
// larger box so the map always fills it, whatever the screen.
const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 168;

// One map tile that fades in once it has loaded, so the map doesn't pop
// in tile-by-tile. A tile that fails (offline, blocked) just stays hidden
// and the grid placeholder behind it shows through.
function MapTile({ src, left, top }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <img
      src={src}
      alt=""
      draggable={false}
      decoding="async"
      data-loaded={loaded}
      onLoad={() => setLoaded(true)}
      className="location-tile absolute max-w-none select-none"
      style={{
        width: TILE_SIZE,
        height: TILE_SIZE,
        left: `calc(50% + ${left}px)`,
        top: `calc(50% + ${top}px)`,
      }}
    />
  );
}

// Teardrop pin whose tip sits exactly on the map centre, with a soft
// accuracy halo and a ground shadow so it reads as standing on the map.
function MapPin() {
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#5b6dfa]/40 bg-[#5b6dfa]/15"
      />
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 h-1.5 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/40 blur-[2px]"
      />
      <svg
        aria-hidden="true"
        width="30"
        height="40"
        viewBox="0 0 30 40"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full drop-shadow-[0_3px_3px_rgba(0,0,0,0.35)]"
      >
        <path
          d="M15 39S28 25.5 28 14.5C28 7.04 22.18 1 15 1S2 7.04 2 14.5C2 25.5 15 39 15 39Z"
          fill="#5b6dfa"
          stroke="#fff"
          strokeWidth="2"
        />
        <circle cx="15" cy="14.5" r="5" fill="#fff" />
      </svg>
    </>
  );
}

/**
 * A shared location, drawn as a map preview. The whole card is one link
 * that opens the spot in Google Maps (new tab / the Maps app on phones).
 */
export function LocationCard({ latitude, longitude, href }) {
  const { theme } = useTheme();
  const tiles = getTileLayout(latitude, longitude, VIEW_WIDTH, VIEW_HEIGHT);
  const coordinates = formatCoordinates(latitude, longitude);

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`Open location in Google Maps (${coordinates})`}
      title={coordinates}
      className="location-card group block w-[min(18rem,calc(90vw-3rem))]"
    >
      <div className="location-map relative h-37 overflow-hidden rounded-[11px]">
        <div className="location-map-layer absolute inset-0">
          {tiles.map((tile) => (
            <MapTile
              key={`${theme}:${tile.key}`}
              src={getTileUrl(theme, tile)}
              left={tile.left}
              top={tile.top}
            />
          ))}
        </div>

        <MapPin />

        <span className="location-credit pointer-events-none absolute bottom-1 right-1.5 text-[9px] leading-none">
          © OpenStreetMap · CARTO
        </span>
      </div>

      <div className="flex items-center gap-2 px-2 pb-0.5 pt-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold leading-tight">Shared location</p>
          <p className="truncate text-[12px] leading-snug opacity-70">Open in Google Maps</p>
        </div>
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-current/10 transition-transform group-hover:translate-x-px group-hover:-translate-y-px"
        >
          <ArrowUpRight size={17} strokeWidth={2.25} />
        </span>
      </div>
    </a>
  );
}
