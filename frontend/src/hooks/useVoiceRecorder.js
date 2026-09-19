import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

// Hard cap so a forgotten recording can't grow without bound (and stays well
// under the backend's 25 MB upload limit — Opus voice is only a few KB/s).
const MAX_RECORDING_SECONDS = 5 * 60;

// 32 kbps is plenty for speech and keeps a full 5 minute note around 1.2 MB,
// comfortably inside serverless request-body limits (e.g. Vercel's 4.5 MB).
const VOICE_BITS_PER_SECOND = 32_000;

// In order of preference. Chrome/Firefox/Edge record webm or ogg (Opus);
// Safari (macOS + iOS) only records mp4/AAC.
const MIME_TYPE_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function pickSupportedMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_TYPE_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function getExtension(mimeType) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

/**
 * Records a voice note from the microphone.
 *
 *   const { isRecording, elapsedSeconds, startRecording, stopRecording, cancelRecording } =
 *     useVoiceRecorder();
 *
 * `stopRecording()` resolves to `{ file, duration }` (a File ready for
 * FormData, and its length in seconds), or `null` if nothing was recorded.
 * `cancelRecording()` throws the recording away.
 *
 * If the recording hits the time limit on its own, `onAutoStop` receives the
 * same `{ file, duration }` result so the caller can send it.
 */
export function useVoiceRecorder({ onAutoStop } = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);
  const stopResolverRef = useRef(null);
  const shouldDiscardRef = useRef(false);
  const onAutoStopRef = useRef(onAutoStop);

  useEffect(() => {
    onAutoStopRef.current = onAutoStop;
  }, [onAutoStop]);

  const releaseMicrophone = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setIsRecording(false);
    setElapsedSeconds(0);
  }, []);

  const finishRecording = useCallback(
    (discard) =>
      new Promise((resolve) => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === "inactive") {
          resolve(null);
          return;
        }
        shouldDiscardRef.current = discard;
        stopResolverRef.current = resolve;
        recorder.stop();
      }),
    [],
  );

  const startRecording = useCallback(async () => {
    if (recorderRef.current) return false;

    const mimeType = pickSupportedMimeType();
    if (mimeType === null || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Voice messages aren't supported in this browser");
      return false;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      toast.error(
        error?.name === "NotAllowedError"
          ? "Microphone access was blocked — allow it in your browser settings"
          : "Couldn't access your microphone",
      );
      return false;
    }

    try {
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: VOICE_BITS_PER_SECOND,
      });
      chunksRef.current = [];
      shouldDiscardRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const duration = (Date.now() - startedAtRef.current) / 1000;
        const resolvedType = (recorder.mimeType || mimeType || "audio/webm").split(";")[0];
        const blob = new Blob(chunksRef.current, { type: resolvedType });
        const resolve = stopResolverRef.current;

        stopResolverRef.current = null;
        chunksRef.current = [];
        releaseMicrophone();

        if (!resolve) return;
        if (shouldDiscardRef.current || blob.size === 0 || duration < 0.5) {
          resolve(null);
          return;
        }

        const file = new File([blob], `voice-note-${Date.now()}.${getExtension(resolvedType)}`, {
          type: resolvedType,
        });
        resolve({ file, duration });
      };

      streamRef.current = stream;
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start();

      setIsRecording(true);
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsedSeconds(seconds);
        if (seconds >= MAX_RECORDING_SECONDS && recorder.state === "recording") {
          toast("Reached the 5 minute limit");
          finishRecording(false).then((result) => onAutoStopRef.current?.(result));
        }
      }, 250);

      return true;
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      toast.error("Couldn't start recording");
      return false;
    }
  }, [finishRecording, releaseMicrophone]);

  const stopRecording = useCallback(() => finishRecording(false), [finishRecording]);
  const cancelRecording = useCallback(() => finishRecording(true), [finishRecording]);

  // Leaving the chat (or unmounting mid-recording) must free the mic —
  // otherwise the browser's "recording" indicator stays on.
  useEffect(
    () => () => {
      shouldDiscardRef.current = true;
      stopResolverRef.current = null;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      else streamRef.current?.getTracks().forEach((track) => track.stop());
      clearInterval(timerRef.current);
    },
    [],
  );

  return { isRecording, elapsedSeconds, startRecording, stopRecording, cancelRecording };
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
