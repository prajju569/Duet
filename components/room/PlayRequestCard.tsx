"use client";

import { useEffect, useState } from "react";
import { thumbUrl } from "@/lib/youtube";
import type { Track } from "@/lib/types";

export const REQUEST_SECONDS = 20;

/** "Pajju wants to play Tum Hi Ho" — shown to whoever is listening to their own pick. */
export function PlayRequestCard({
  fromName,
  track,
  onAnswer,
}: {
  fromName: string;
  track: Track;
  onAnswer: (choice: "now" | "next" | "keep") => void;
}) {
  const [left, setLeft] = useState(REQUEST_SECONDS);
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left <= 0) onAnswer("next"); // no answer → it waits in Up next
  }, [left, onAnswer]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),10px)] z-[58] flex justify-center px-3">
      <div role="dialog" aria-label="Song request" className="animate-pop pointer-events-auto w-full max-w-sm overflow-hidden rounded-3xl bg-zinc-900/97 shadow-2xl ring-1 ring-white/15 backdrop-blur">
        <div className="flex items-center gap-3 p-3.5 pb-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrl(track.videoId)} alt="" className="size-12 shrink-0 rounded-xl bg-white/10 object-cover" />
          <div className="min-w-0 flex-1 leading-snug">
            <div className="text-[12px] text-rose-200/90">🎵 {fromName} wants to play</div>
            <div className="truncate text-[15px] font-semibold">{track.title}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 px-3 pb-3">
          <button onClick={() => onAnswer("now")} className="rounded-xl bg-cream py-2.5 text-[13px] font-semibold text-ink active:scale-95">
            ▶ Play now
          </button>
          <button onClick={() => onAnswer("next")} className="rounded-xl bg-white/10 py-2.5 text-[13px] font-semibold active:scale-95">
            ⏭ Play next
          </button>
          <button onClick={() => onAnswer("keep")} className="rounded-xl bg-white/5 py-2.5 text-[13px] text-cream/75 active:scale-95">
            Keep this
          </button>
        </div>
        <div className="h-1 bg-white/10">
          <div className="h-full bg-rose-300/70 transition-[width] duration-1000 ease-linear" style={{ width: `${(left / REQUEST_SECONDS) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
