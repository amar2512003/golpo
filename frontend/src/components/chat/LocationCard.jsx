import { useState } from "react";
import { Avatar } from "@heroui/react";
import { ChevronRightIcon, MapPinIcon } from "lucide-react";
import { formatCoordinates, getTileGrid, TILE_SIZE } from "../../lib/location";
import { getInitials } from "../../hooks/useSelectedConversation";

const ZOOM = 16; // street level
const MAP_HEIGHT = 176; // px
// Where the location sits inside the map area. Above centre on purpose:
// the glass footer covers the bottom of the map, and the pin should sit
// in the part you can actually see.
const POINT_Y = 74;

function MapTile({ url, row, col }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <img
      src={url}
      alt=""
      draggable={false}
      loading="lazy"
      onError={() => setFailed(true)}
      className="absolute select-none"
      style={{
        left: col * TILE_SIZE,
        top: row * TILE_SIZE,
        width: TILE_SIZE,
        height: TILE_SIZE,
      }}
    />
  );
}

// A shared-location message drawn as a tappable glass card: a static map
// centred on the spot, the sender's avatar as the pin, and a frosted
// footer that opens the place in Google Maps.
export function LocationCard({ lat, lng, url, avatarUrl, name, avatarName }) {
  const { tiles, pointX, pointY } = getTileGrid(lat, lng, ZOOM);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${name ? `${name}'s` : "shared"} location in Google Maps`}
      className="location-card group relative block w-64 max-w-full overflow-hidden rounded-2xl border border-white/30 shadow-lg shadow-black/25 ring-1 ring-black/10 transition-transform duration-200 hover:scale-[1.015] active:scale-[0.99] sm:w-72"
      style={{ height: MAP_HEIGHT }}
    >
      {/* Map: a 3x3 block of tiles, shifted so the location lands on POINT_Y. */}
      <div
        className="location-map-tiles pointer-events-none absolute"
        style={{
          width: TILE_SIZE * 3,
          height: TILE_SIZE * 3,
          left: `calc(50% - ${pointX}px)`,
          top: POINT_Y - pointY,
        }}
      >
        {tiles.map((tile) => (
          <MapTile key={`${tile.row}-${tile.col}`} {...tile} />
        ))}
      </div>

      {/* Soft halo where the location is */}
      <span
        className="pointer-events-none absolute left-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#5b6dfa]/25"
        style={{ top: POINT_Y }}
        aria-hidden
      />

      {/* Sender's avatar as the map pin */}
      <div
        className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 -translate-y-full flex-col items-center transition-transform duration-200 group-hover:-translate-y-[calc(100%+3px)]"
        style={{ top: POINT_Y }}
        aria-hidden
      >
        <Avatar className="size-11 shadow-lg shadow-black/40 ring-[3px] ring-white">
          <Avatar.Image src={avatarUrl} alt="" />
          <Avatar.Fallback className="bg-[#5b6dfa] text-sm font-semibold text-white">
            {getInitials(avatarName || name || "?").slice(0, 2)}
          </Avatar.Fallback>
        </Avatar>
        <span className="-mt-1.5 size-3 rotate-45 rounded-[2px] bg-white shadow-md shadow-black/30" />
      </div>

      {/* Required by OpenStreetMap's tile usage policy */}
      <span className="location-attribution pointer-events-none absolute right-1.5 top-1 text-[9px] font-medium">
        © OpenStreetMap
      </span>

      {/* Glass footer */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2.5 border-t border-white/25 bg-black/35 px-3 py-2.5 text-white backdrop-blur-xl backdrop-saturate-150">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/20">
          <MapPinIcon className="size-4" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight">
            {name ? `${name}'s location` : "Shared location"}
          </p>
          <p className="truncate text-[11px] tabular-nums leading-tight text-white/70">
            {formatCoordinates(lat, lng)}
          </p>
        </div>

        <ChevronRightIcon
          className="size-4 shrink-0 text-white/70 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>
    </a>
  );
}
