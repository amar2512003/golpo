import { APP_NAME, AppLogo } from "./AppLogo";

export default function PageLoader() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-8 bg-[#0a0a0c]">
      <div className="relative flex items-center justify-center">
        <div className="absolute size-40 animate-[spin_8s_linear_infinite] rounded-full border border-white/10" />
        <div className="absolute size-52 animate-[spin_12s_linear_infinite_reverse] rounded-full border border-white/5" />

        <div className="absolute size-32 animate-ping rounded-full bg-white/5" />

        <div className="relative z-10 animate-[pulse_2.2s_ease-in-out_infinite]">
          <AppLogo size={96} className="rounded-3xl shadow-2xl shadow-black/40" />
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <p className="text-sm font-medium tracking-wide text-white/70">Loading {APP_NAME}</p>
        <div className="flex gap-1.5">
          <span className="size-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.3s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.15s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-white/60" />
        </div>
      </div>
    </div>
  );
}