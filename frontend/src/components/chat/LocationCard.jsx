import { ArrowUpRight } from "lucide-react";
import { formatCoordinates, getGoogleMapsEmbedUrl } from "../../lib/location";

/**
 * A shared location, drawn as a live Google Maps preview.
 *
 * This uses Google's `output=embed` iframe form — the same one Google's
 * own "embed a map" share button gives you — which doesn't need an API
 * key or billing, unlike the Maps JavaScript/Static/Tiles APIs. It's
 * undocumented and unsupported, so it could change or stop rendering
 * without notice; if that ever happens, swap the src builder in
 * lib/location.js for a keyless raster-tile provider instead.
 *
 * The iframe is inert (pointer-events disabled, not focusable) so it
 * reads as a static preview, not a map you can pan around inside a chat
 * bubble. The whole card is one link that opens the real Google Maps
 * (new tab / the Maps app on phones).
 */
export function LocationCard({ latitude, longitude, href }) {
  const coordinates = formatCoordinates(latitude, longitude);
  const embedSrc = getGoogleMapsEmbedUrl(latitude, longitude);

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
        <iframe
          src={embedSrc}
          title={`Map preview: ${coordinates}`}
          loading="lazy"
          tabIndex={-1}
          aria-hidden="true"
          referrerPolicy="no-referrer-when-downgrade"
          className="location-map-frame pointer-events-none absolute inset-0 h-full w-full border-0"
        />
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
