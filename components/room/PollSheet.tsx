"use client";

import { useState } from "react";

/** Make a quick poll: a question + 2–6 choices. */
export function PollSheet({ onClose, onSend }: { onClose: () => void; onSend: (question: string, options: string[]) => void }) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState(["", ""]);
  const clean = opts.map((o) => o.trim()).filter(Boolean);
  const ok = q.trim() && clean.length >= 2 && new Set(clean.map((o) => o.toLowerCase())).size === clean.length;
  return (
    <div className="vv-fixed z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onSend(q.trim(), clean);
        }}
        className="animate-rise max-h-full w-full max-w-md overflow-y-auto rounded-t-[2rem] bg-[#1d1419] p-6 pb-[max(env(safe-area-inset-bottom),24px)] ring-1 ring-white/10 sm:rounded-[2rem]"
      >
        <h2 className="font-display text-2xl italic">📊 Quick poll</h2>
        <input
          autoFocus
          value={q}
          maxLength={120}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Dinner tonight?"
          className="mt-4 h-12 w-full rounded-2xl bg-white/8 px-4 text-base ring-1 ring-white/10 placeholder:text-cream/35 focus:ring-white/30 focus:outline-none"
        />
        <div className="mt-3 space-y-2">
          {opts.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={o}
                maxLength={60}
                onChange={(e) => setOpts((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={["Biryani 🍛", "Pizza 🍕", "Dosa", "Something else"][i] ?? `Choice ${i + 1}`}
                aria-label={`Choice ${i + 1}`}
                className="h-11 min-w-0 flex-1 rounded-2xl bg-white/6 px-4 text-base ring-1 ring-white/10 placeholder:text-cream/30 focus:ring-white/30 focus:outline-none"
              />
              {opts.length > 2 && (
                <button type="button" onClick={() => setOpts((xs) => xs.filter((_, j) => j !== i))} aria-label={`Remove choice ${i + 1}`} className="p-2 text-cream/50">
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        {opts.length < 6 && (
          <button type="button" onClick={() => setOpts((xs) => [...xs, ""])} className="mt-2 text-sm text-rose-200">
            + Add a choice
          </button>
        )}
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="h-12 flex-1 rounded-2xl bg-white/8 font-semibold ring-1 ring-white/10">
            Cancel
          </button>
          <button disabled={!ok} className="h-12 flex-1 rounded-2xl bg-cream font-semibold text-ink disabled:opacity-40">
            Send poll
          </button>
        </div>
      </form>
    </div>
  );
}
