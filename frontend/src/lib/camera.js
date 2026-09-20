// Camera switching for video calls. Shared by the 1:1 call store and the
// group (mesh) call store so the two can't drift apart.
//
// Flipping is the same trick screen sharing uses: open the other camera,
// then swap it into each connection's video sender with replaceTrack().
// Same m-line, same connection — no new offer/answer round-trip, and the
// other side just sees the picture change.

const isVideoInput = (device) => device.kind === "videoinput";

// Whether this device has more than one camera to switch between. Only
// meaningful once camera permission has been granted (before that,
// browsers report at most one generic entry), so call it after the call's
// getUserMedia succeeds.
export async function hasMultipleCameras() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return false;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(isVideoInput).length > 1;
  } catch {
    return false;
  }
}

// What we need to know about the current camera *before* stopping it —
// some browsers stop reporting settings once a track has ended.
function describeCamera(track) {
  const settings = track.getSettings?.() ?? {};
  return {
    deviceId: settings.deviceId ?? null,
    // Phones report "user" (front) or "environment" (back); most laptop
    // webcams report nothing.
    facingMode:
      settings.facingMode === "user" || settings.facingMode === "environment"
        ? settings.facingMode
        : null,
  };
}

async function openCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
  return stream.getVideoTracks()[0];
}

/**
 * Stops `currentTrack` and opens the other camera.
 *
 * Resolves to `{ track, switched }`. `switched: false` means no other
 * camera could be opened, so `track` is the *previous* camera reopened —
 * the caller must still use it, because the old track is already stopped.
 * Rejects only if not even the previous camera can be reopened.
 *
 * The old camera is released first on purpose: most phones (and iOS
 * Safari in particular) can't run the front and back cameras at once, and
 * asking for the second while the first is still open fails.
 */
export async function switchCameraTrack(currentTrack) {
  const previous = describeCamera(currentTrack);

  currentTrack.onended = null;
  currentTrack.stop();

  const attempts = [];

  // Phones: ask for the opposite side by name.
  if (previous.facingMode) {
    const wanted = previous.facingMode === "user" ? "environment" : "user";
    attempts.push(() => openCamera({ facingMode: { exact: wanted } }));
  }

  // Everything else (and phones that don't honour facingMode): step to
  // the next camera in the device list, wrapping around.
  attempts.push(async () => {
    const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(isVideoInput);
    if (cameras.length < 2) throw new Error("No other camera available");

    const index = cameras.findIndex((camera) => camera.deviceId === previous.deviceId);
    const next = cameras[(index + 1) % cameras.length];
    return openCamera({ deviceId: { exact: next.deviceId } });
  });

  for (const attempt of attempts) {
    try {
      const track = await attempt();
      // Guard against a browser quietly handing back the same camera.
      if (!previous.deviceId || track.getSettings?.().deviceId !== previous.deviceId) {
        return { track, switched: true };
      }
      track.stop();
    } catch (err) {
      console.warn("Camera switch attempt failed:", err);
    }
  }

  // Nothing else worked — get the original camera back rather than
  // leaving the call with no video at all.
  const track = await openCamera(
    previous.deviceId
      ? { deviceId: { exact: previous.deviceId } }
      : previous.facingMode
        ? { facingMode: previous.facingMode }
        : true,
  );
  return { track, switched: false };
}
