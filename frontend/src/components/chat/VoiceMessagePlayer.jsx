import { PauseIcon, PlayIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatDuration } from "../../hooks/useVoiceRecorder";

// Only one voice note should play at a time — starting another pauses this one.
let currentlyPlaying = null;

const PLAYBACK_RATES = [1, 1.5, 2];

/**
 * Inline player for a voice note: play/pause, a seekable progress bar, the
 * remaining/total time and a playback-speed toggle.
 *
 * `duration` is the length the sender's recorder reported. It's preferred
 * over the <audio> element's own duration because MediaRecorder files (webm)
 * commonly report `Infinity` until fully played.
 */
export function VoiceMessagePlayer({ src, duration, isOwnMessage }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [rateIndex, setRateIndex] = useState(0);

  const totalDuration = duration || (Number.isFinite(mediaDuration) ? mediaDuration : 0);
  const progress = totalDuration > 0 ? Math.min(currentTime / totalDuration, 1) : 0;

  useEffect(
    () => () => {
      const audio = audioRef.current;
      if (audio && currentlyPlaying === audio) currentlyPlaying = null;
      audio?.pause();
    },
    [],
  );

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      if (currentlyPlaying && currentlyPlaying !== audio) currentlyPlaying.pause();
      currentlyPlaying = audio;
      audio.play().catch((error) => console.log("Voice note playback failed:", error));
    } else {
      audio.pause();
    }
  };

  const handleSeek = (event) => {
    const audio = audioRef.current;
    if (!audio || totalDuration <= 0) return;
    const nextTime = (Number(event.target.value) / 100) * totalDuration;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const cycleRate = () => {
    const nextIndex = (rateIndex + 1) % PLAYBACK_RATES.length;
    setRateIndex(nextIndex);
    if (audioRef.current) audioRef.current.playbackRate = PLAYBACK_RATES[nextIndex];
  };

  const mutedText = isOwnMessage ? "text-accent-foreground/75" : "text-muted";

  return (
    <div className="voice-note flex w-56 max-w-full items-center gap-2.5 sm:w-64">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => setMediaDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
          if (currentlyPlaying === audioRef.current) currentlyPlaying = null;
        }}
      />

      <button
        type="button"
        onClick={togglePlayback}
        aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
        className={`flex size-9 shrink-0 touch-manipulation items-center justify-center rounded-full ${
          isOwnMessage ? "bg-accent-foreground/20 text-accent-foreground" : "bg-accent text-accent-foreground"
        }`}
      >
        {isPlaying ? (
          <PauseIcon className="size-4" fill="currentColor" strokeWidth={0} />
        ) : (
          <PlayIcon className="size-4 translate-x-px" fill="currentColor" strokeWidth={0} />
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <input
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={progress * 100}
          onChange={handleSeek}
          aria-label="Voice message position"
          className="voice-note-range h-1 w-full cursor-pointer"
          style={{ "--voice-progress": `${progress * 100}%` }}
        />
        <span className={`text-[11px] tabular-nums ${mutedText}`}>
          {formatDuration(isPlaying || currentTime > 0 ? currentTime : totalDuration)}
        </span>
      </div>

      <button
        type="button"
        onClick={cycleRate}
        aria-label="Change playback speed"
        className={`shrink-0 touch-manipulation rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
          isOwnMessage ? "bg-accent-foreground/20" : "bg-accent/15 text-accent"
        }`}
      >
        {PLAYBACK_RATES[rateIndex]}x
      </button>
    </div>
  );
}
