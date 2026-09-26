"use client";

import { useState } from "react";
import type { Countdown } from "@/lib/types";

/** "Days until …" — shown at the top of the chat for both of you. */
export function CountdownSheet({ current, onClose, onSave }: { current: Countdown | null; onClose: () => void; onSave: (c: Countdown | null) => void }) {
  const [label, setLabel] = useState(current?.label ?? "");
  const [date, setDate] = useState(current?.date ?? "");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="vv-fixed z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim() && date) onSave({ label: label.trim(), date });
        }}
        className="animate-rise w-full max-w-md rounded-t-[2rem] bg-[#1d1419] p-6 pb-[max(env(safe-area-inset-bottom),24px)] ring-1 ring-white/10 sm:rounded-[2rem]"
      >
        <h2 className="font-display text-2xl italic">⏳ Countdown</h2>
        <p className="mt-1 text-sm text-cream/60">Something to look forward to — you both see it at the top of the chat.</p>
        <input
          value={label}
          maxLength={40}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Goa trip 🏖️ / Seeing you ❤️"
          className="mt-4 h-12 w-full rounded-2xl bg-white/8 px-4 text-base ring-1 ring-white/10 placeholder:text-cream/35 focus:ring-white/30 focus:outline-none"
        />
        <input
          type="date"
          value={date}
          min={today}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date"
          className="mt-3 h-12 w-full rounded-2xl bg-white/8 px-4 text-base ring-1 ring-white/10 focus:ring-white/30 focus:outline-none"
        />
        <div className="mt-5 flex gap-2">
          {current ? (
            <button type="button" onClick={() => onSave(null)} className="h-12 flex-1 rounded-2xl bg-white/8 font-semibold text-rose-300 ring-1 ring-white/10">
              Remove
            </button>
          ) : (
            <button type="button" onClick={onClose} className="h-12 flex-1 rounded-2xl bg-white/8 font-semibold ring-1 ring-white/10">
              Cancel
            </button>
          )}
          <button disabled={!label.trim() || !date} className="h-12 flex-1 rounded-2xl bg-cream font-semibold text-ink disabled:opacity-40">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

/** Whole days from today (local) to an ISO date. */
export function daysUntil(date: string, now = new Date()) {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}
