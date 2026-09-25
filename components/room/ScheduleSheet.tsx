"use client";

import { useMemo, useState } from "react";
import type { Track } from "@/lib/types";

const LABELS = ["Good night 🌙", "Good morning ☀️", "Just because 💞"];

function nextOccurrence(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= Date.now() + 30_000) d.setDate(d.getDate() + 1);
  return d;
}

/** Pick a song + a time; it starts for both of you then (if Duet is open on a phone). */
export function ScheduleSheet({
  options,
  onSave,
  onClose,
}: {
  options: Track[];
  onSave: (at: Date, track: Track, label: string) => void;
  onClose: () => void;
}) {
  const [time, setTime] = useState("22:30");
  const [label, setLabel] = useState(LABELS[0]);
  const [pick, setPick] = useState<Track | null>(options[0] ?? null);
  const when = useMemo(() => nextOccurrence(time), [time]);
  const isTomorrow = when.toDateString() !== new Date().toDateString();

  return (
    <div className="vv-fixed z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-rise flex max-h-full w-full max-w-md flex-col rounded-t-[2rem] bg-[#1d1419] p-6 pb-[max(env(safe-area-inset-bottom),24px)] ring-1 ring-white/10 sm:rounded-[2rem]"
      >
        <h2 className="font-display text-2xl italic">Schedule a song ⏰</h2>
        <p className="mt-1 text-sm text-cream/60">It starts for both of you at that time — keep Duet open on a phone.</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {LABELS.map((l) => (
            <button
              key={l}
              onClick={() => setLabel(l)}
              className={`rounded-full px-3 py-1.5 text-[13px] ${label === l ? "bg-cream font-semibold text-ink" : "bg-white/8 ring-1 ring-white/10"}`}
            >
              {l}
            </button>
          ))}
        </div>

        <label className="mt-4 flex items-center justify-between rounded-2xl bg-white/6 px-4 py-3 ring-1 ring-white/10">
          <span className="text-sm text-cream/70">{isTomorrow ? "Tomorrow at" : "Today at"}</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-label="Time"
            className="bg-transparent text-right text-lg font-semibold text-cream focus:outline-none"
          />
        </label>

        <p className="mt-4 text-xs tracking-wide text-cream/50 uppercase">Song</p>
        <ul className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {options.length ? (
            options.map((t) => (
              <li key={t.videoId}>
                <button
                  onClick={() => setPick(t)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${pick?.videoId === t.videoId ? "bg-white/12 ring-1 ring-cream/50" : "hover:bg-white/5"}`}
                >
                  <span className="text-lg">{pick?.videoId === t.videoId ? "●" : "○"}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{t.title}</span>
                    <span className="block truncate text-xs text-cream/50">{t.channel}</span>
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-2 py-4 text-sm text-cream/50">Play a song or save some to Our Songs first.</li>
          )}
        </ul>

        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="h-12 flex-1 rounded-2xl bg-white/8 font-semibold ring-1 ring-white/10">
            Cancel
          </button>
          <button
            disabled={!pick}
            onClick={() => pick && onSave(when, pick, label)}
            className="h-12 flex-1 rounded-2xl bg-cream font-semibold text-ink disabled:opacity-40"
          >
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
