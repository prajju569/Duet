"use client";

import type { PlaybackState } from "@/lib/types";
import { HeadphonesIcon } from "@/components/ui/Icons";
import { thumbUrl } from "@/lib/youtube";

type Props = {
  ready: boolean;
  state: PlaybackState | null;
  partnerName: string | null;
  partnerListening: boolean;
  onJoin: () => void;
};

/** Browsers block autoplay — one tap here unlocks audio, then we sync. */
export function JoinOverlay({ ready, state, partnerName, partnerListening, onJoin }: Props) {
  const art = state?.videoId ? thumbUrl(state.videoId, "hq") : null;
  const line = state?.videoId
    ? partnerListening && partnerName
      ? `${partnerName} is listening to`
      : state.isPlaying
        ? "Now playing"
        : "Paused on"
    : partnerName
      ? `You & ${partnerName}`
      : "Your room is ready";

  return (
    <div className="vv-fixed z-50 flex items-center justify-center bg-ink/70 px-6 backdrop-blur-xl">
      <div className="animate-rise flex w-full max-w-sm flex-col items-center text-center">
        <div className="relative mb-7">
          <div className="absolute -inset-6 rounded-full bg-[var(--c1)] opacity-60 blur-3xl" />
          {art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={art} alt="" className="relative size-44 rounded-[2rem] object-cover shadow-2xl ring-1 ring-white/10" />
          ) : (
            <div className="relative flex size-44 items-center justify-center rounded-[2rem] bg-white/5 text-6xl ring-1 ring-white/10">
              🎧
            </div>
          )}
        </div>
        <p className="text-sm text-cream/60">{line}</p>
        {state?.title && <p className="mt-1 line-clamp-2 font-display text-2xl leading-tight italic">{state.title}</p>}
        <button
          onClick={onJoin}
          disabled={!ready}
          className="mt-8 flex items-center gap-2.5 rounded-full bg-cream px-7 py-4 text-base font-semibold text-ink shadow-[0_10px_40px_-10px_var(--c1)] transition active:scale-95 disabled:opacity-50"
        >
          <HeadphonesIcon size={20} />
          {ready ? "Tap to join the music" : "Warming up…"}
        </button>
        <p className="mt-4 text-xs text-cream/40">Your browser needs one tap before it can play sound.</p>
      </div>
    </div>
  );
}
