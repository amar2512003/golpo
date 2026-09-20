import { useEffect, useState } from "react";
import { hasMultipleCameras } from "../lib/camera";

/**
 * True when the device has a second camera to flip to, so the call UI only
 * offers the button where it can actually work (a laptop with one webcam
 * never sees it). Re-checks if a camera is plugged in or removed.
 *
 * Pass `active` = "we have a live camera stream": camera permission has to
 * be granted before the browser will list every camera.
 */
export function useCanFlipCamera(active) {
  const [hasSecondCamera, setHasSecondCamera] = useState(false);

  useEffect(() => {
    if (!active) return undefined;

    let cancelled = false;
    const check = async () => {
      const result = await hasMultipleCameras();
      if (!cancelled) setHasSecondCamera(result);
    };

    check();
    navigator.mediaDevices?.addEventListener?.("devicechange", check);

    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", check);
    };
  }, [active]);

  return active && hasSecondCamera;
}
