"use client";

import { useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** 🕛 Send later: pick when this message should arrive. */
export function SendLaterSheet({ text, onClose, onPick }: { text: string; onClose: () => void; onPick: (at: Date) => void }) {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0);
  const morning = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (now.getHours() >= 9 ? 1 : 0), 9, 0);
  const [custom, setCustom] = useState(toLocalInput(new Date(now.getTime() + 60 * 60 * 1000)));
  const when = (d: Date) => d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
  const customDate = new Date(custom);
  const customOk = !Number.isNaN(customDate.getTime()) && customDate.getTime() > Date.now() + 30_000;
  return (
    <div className="vv-fixed z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-rise w-full max-w-md rounded-t-[2rem] bg-[#1d1419] p-6 pb-[max(env(safe-area-inset-bottom),24px)] ring-1 ring-white/10 sm:rounded-[2rem]"
      >
        <h2 className="font-display text-2xl italic">🕛 Send later</h2>
        <p className="mt-1 line-clamp-2 text-sm text-cream/60">“{text.trim()}”</p>
        <p className="mt-1 text-xs text-cream/40">They won&apos;t see it until then. It arrives even if your phone is off.</p>
        <div className="mt-4 space-y-2">
          <button onClick={() => onPick(midnight)} className="flex h-12 w-full items-center justify-between rounded-2xl bg-white/8 px-4 ring-1 ring-white/10">
            <span>🌙 At midnight</span>
            <span className="text-sm text-cream/50">{when(midnight)}</span>
          </button>
          <button onClick={() => onPick(morning)} className="flex h-12 w-full items-center justify-between rounded-2xl bg-white/8 px-4 ring-1 ring-white/10">
            <span>☀️ Good morning</span>
            <span className="text-sm text-cream/50">{when(morning)}</span>
          </button>
          <div className="flex gap-2">
            <input
              type="datetime-local"
              value={custom}
              min={toLocalInput(now)}
              onChange={(e) => setCustom(e.target.value)}
              aria-label="Pick a time"
              className="h-12 min-w-0 flex-1 rounded-2xl bg-white/8 px-3 text-base ring-1 ring-white/10 focus:outline-none"
            />
            <button disabled={!customOk} onClick={() => onPick(customDate)} className="h-12 rounded-2xl bg-cream px-5 font-semibold text-ink disabled:opacity-40">
              Schedule
            </button>
          </div>
        </div>
        <button onClick={onClose} className="mt-4 w-full text-sm text-cream/50">
          Cancel
        </button>
      </div>
    </div>
  );
}
