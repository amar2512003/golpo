import { Heart } from "lucide-react";
import { useTypewriterLoop } from "../hooks/useTypewriterLoop";
import { APP_NAME } from "./AppLogo";

/**
 * The sidebar wordmark: "Goppo" typed out with a caret, held, deleted and
 * typed again, on a loop, over the "More than just chats" tagline.
 *
 * The full word is always laid out invisibly underneath the typed letters,
 * so the box never changes size as letters come and go and nothing around it
 * (tagline, avatar button) jumps. Screen readers get the plain name, not the
 * animation.
 */
export function AnimatedBrand({ text = APP_NAME }) {
  const { typed, busy, animated } = useTypewriterLoop(text);

  return (
    <div className="min-w-0 flex-1">
      <p className="brand-name text-lg sm:text-[22px]">
        <span className="sr-only">{text}</span>
        <span aria-hidden="true" className="brand-name-sizer">
          {text}
        </span>
        <span aria-hidden="true" className="brand-name-typed">
          {typed}
          {animated ? <i className="brand-caret" data-busy={busy} /> : null}
        </span>
      </p>
      <p className="brand-tagline">
        <span className="truncate">More than just chats</span>
        <Heart aria-hidden="true" size={11} strokeWidth={2} className="brand-heart shrink-0" />
      </p>
    </div>
  );
}
