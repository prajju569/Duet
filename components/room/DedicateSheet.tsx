"use client";

import { useState } from "react";
import type { Track } from "@/lib/types";
import { thumbUrl } from "@/lib/youtube";

/** "💌 Dedicate this song" — with an optional little note. */
export function DedicateSheet({ track, partnerName, onSend, onClose }: { track: Track; partnerName: string; onSend: (note: string) => void; onClose: () => void }) {
  const [note, setNote] = useState("");
  return (
    <div className="vv-fixed z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSend(note);
        }}
        className="animate-rise w-full max-w-md rounded-t-[2rem] bg-[#1d1419] p-6 pb-[max(env(safe-area-inset-bottom),24px)] ring-1 ring-white/10 sm:rounded-[2rem]"
      >
        <h2 className="font-display text-2xl italic">Dedicate to {partnerName} 💌</h2>
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/5 p-2.5 ring-1 ring-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrl(track.videoId)} alt="" className="h-11 w-[4.4rem] rounded-lg bg-white/10 object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{track.title}</div>
            <div className="truncate text-xs text-cream/55">{track.channel}</div>
          </div>
        </div>
        <textarea
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 280))}
          rows={3}
          placeholder="Add a little note (optional) — “this one reminds me of you”"
          className="mt-3 w-full resize-none rounded-2xl bg-white/8 px-4 py-3 text-base ring-1 ring-white/10 placeholder:text-cream/35 focus:ring-white/30 focus:outline-none"
        />
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onClose} className="h-12 flex-1 rounded-2xl bg-white/8 font-semibold ring-1 ring-white/10">
            Cancel
          </button>
          <button className="h-12 flex-1 rounded-2xl bg-gradient-to-r from-rose-300 to-orange-200 font-semibold text-ink">Send 💌</button>
        </div>
      </form>
    </div>
  );
}
