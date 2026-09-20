import { useEffect, useState } from "react";
import { useMediaQuery } from "./useMediaQuery";

// Timing (ms). Typing gets a little random jitter so it feels hand-typed
// rather than mechanical.
export const TYPEWRITER_TIMING = {
  start: 350, // beat before the first letter
  type: 125, // per letter, typing
  jitter: 45, // +/- random wobble on each typed letter
  hold: 4200, // finished word sits there, caret blinking
  erase: 60, // per letter, deleting
  pause: 600, // empty beat before typing again
};

/**
 * One step of the type -> hold -> erase -> pause loop. Pure (no timers, no
 * React) so the sequence can be tested on its own.
 *
 * Takes the current { count, phase } and the word length, returns the next
 * state and how long to wait before the step after it.
 */
export function advanceTypewriter({ count, phase }, length, timing = TYPEWRITER_TIMING, random = Math.random) {
  if (phase === "typing") {
    const next = count + 1;
    if (next >= length) return { state: { count: length, phase: "holding" }, delay: timing.hold };
    return {
      state: { count: next, phase: "typing" },
      delay: timing.type + (random() * 2 - 1) * timing.jitter,
    };
  }

  if (phase === "holding") {
    return { state: { count, phase: "erasing" }, delay: timing.erase };
  }

  // erasing
  const next = count - 1;
  if (next <= 0) return { state: { count: 0, phase: "typing" }, delay: timing.pause };
  return { state: { count: next, phase: "erasing" }, delay: timing.erase };
}

/**
 * Types `text` out letter by letter, holds it, deletes it, and starts over —
 * for as long as the component is mounted. Returns what's on screen right
 * now plus whether the caret should be solid (mid-typing/erasing) or
 * blinking (idle).
 *
 * Respects "reduce motion" (shows the full word, no animation) and stops
 * advancing while the tab is hidden so it isn't burning timers unseen.
 */
export function useTypewriterLoop(text) {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [state, setState] = useState({ count: 0, phase: "typing" });

  useEffect(() => {
    if (reduceMotion) return undefined;

    let current = { count: 0, phase: "typing" };
    let timer;

    const step = () => {
      if (document.hidden) {
        timer = setTimeout(step, 1000);
        return;
      }
      const { state: next, delay } = advanceTypewriter(current, text.length);
      current = next;
      setState(next);
      timer = setTimeout(step, delay);
    };

    timer = setTimeout(step, TYPEWRITER_TIMING.start);
    return () => clearTimeout(timer);
  }, [text, reduceMotion]);

  if (reduceMotion) return { typed: text, busy: false, animated: false };

  const busy = (state.phase === "typing" && state.count > 0) || state.phase === "erasing";
  return { typed: text.slice(0, state.count), busy, animated: true };
}
