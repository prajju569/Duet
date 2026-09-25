"use client";

import { THEMES } from "@/lib/themes";

export function ThemeSheet({ current, onPick, onClose }: { current: string | null; onPick: (id: string | null) => void; onClose: () => void }) {
  const swatch = (bg: string) => ({ background: bg });
  return (
    <div className="vv-fixed z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-rise w-full max-w-md rounded-t-[2rem] bg-[#1d1419] p-6 pb-[max(env(safe-area-inset-bottom),24px)] ring-1 ring-white/10 sm:rounded-[2rem]"
      >
        <h2 className="font-display text-2xl italic">Room colours</h2>
        <p className="mt-1 text-sm text-cream/60">You both see the same theme.</p>
        <div className="mt-5 grid grid-cols-4 gap-3">
          <button
            onClick={() => onPick(null)}
            className={`flex flex-col items-center gap-1.5 rounded-2xl p-2 text-xs ${current === null ? "bg-white/10 ring-2 ring-cream" : "ring-1 ring-white/10"}`}
          >
            <span className="size-12 rounded-full" style={swatch("conic-gradient(from 0deg, #b8325a, #e8964a, #3b82f6, #22c55e, #b8325a)")} />
            Auto
          </button>
          {Object.entries(THEMES).map(([id, t]) => (
            <button
              key={id}
              onClick={() => onPick(id)}
              aria-label={`${t.label} theme`}
              className={`flex flex-col items-center gap-1.5 rounded-2xl p-2 text-xs ${current === id ? "bg-white/10 ring-2 ring-cream" : "ring-1 ring-white/10"}`}
            >
              <span className="size-12 rounded-full" style={swatch(`linear-gradient(135deg, ${t.palette.c1}, ${t.palette.c2} 60%, ${t.palette.c3})`)} />
              {t.label}
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs text-cream/40">Auto follows the colours of whatever song is playing.</p>
        <button onClick={onClose} className="mt-4 h-12 w-full rounded-2xl bg-white/8 font-semibold ring-1 ring-white/10">
          Done
        </button>
      </div>
    </div>
  );
}
