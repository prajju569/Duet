"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PlaybackState } from "@/lib/types";
import { currentLine, parseLrc } from "@/lib/lyrics";

type Result = { found: boolean; guess?: boolean; track?: string; artist?: string; synced?: string | null; plain?: string | null; error?: string };
const cache = new Map<string, Result>();

/** Lyrics for the current song — time-synced ones highlight and follow along. */
export function LyricsPanel({ state, getPosition }: { state: PlaybackState | null; getPosition: () => number }) {
  const vid = state?.videoId ?? null;
  const [res, setRes] = useState<Result | null>(vid ? (cache.get(vid) ?? null) : null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!vid || !state?.title) return setRes(null);
    const hit = cache.get(vid);
    if (hit) return setRes(hit);
    let alive = true;
    setLoading(true);
    const q = new URLSearchParams({ title: state.title, channel: state.channel ?? "", duration: String(state.durationSec ?? "") });
    fetch(`/api/lyrics?${q}`)
      .then((r) => r.json())
      .catch(() => ({ found: false, error: "offline" }))
      .then((j: Result) => {
        if (!alive) return;
        if (!j.error) cache.set(vid, j);
        setRes(j);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [vid, state?.title, state?.channel, state?.durationSec]);

  const lines = useMemo(() => (res?.synced ? parseLrc(res.synced).filter((l) => l.text) : []), [res?.synced]);

  useEffect(() => {
    if (!lines.length) return;
    const tick = () => setActive(currentLine(lines, getPosition()));
    tick();
    const t = setInterval(tick, 300);
    return () => clearInterval(t);
  }, [lines, getPosition]);

  useEffect(() => {
    const el = boxRef.current?.querySelector<HTMLElement>(`[data-line="${active}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active]);

  if (!vid) return <p className="px-6 py-10 text-center text-sm text-cream/45">Play a song to see its lyrics.</p>;
  if (loading && !res) return <p className="px-6 py-10 text-center text-sm text-cream/45">Finding the lyrics…</p>;
  if (!res?.found)
    return (
      <p className="px-6 py-10 text-center text-sm text-cream/45">
        {res?.error ? "Couldn't reach the lyrics service right now." : "No lyrics found for this one. 🎶"}
      </p>
    );

  return (
    <div ref={boxRef} className="max-h-[50vh] overflow-y-auto px-4 pb-6 [mask-image:linear-gradient(transparent,black_12%,black_88%,transparent)]">
      {res.guess && <p className="pt-3 pb-1 text-center text-[11px] text-cream/40">Best guess — may not match this exact version</p>}
      <div className="py-6">
        {lines.length
          ? lines.map((l, i) => (
              <p
                key={i}
                data-line={i}
                className={`py-1.5 text-center font-display text-xl leading-snug transition-all duration-300 ${
                  i === active ? "scale-[1.04] text-cream" : i < active ? "text-cream/35" : "text-cream/55"
                }`}
              >
                {l.text}
              </p>
            ))
          : (res.plain ?? "").split("\n").map((l, i) => (
              <p key={i} className="py-1 text-center text-[17px] leading-snug text-cream/80">
                {l || " "}
              </p>
            ))}
      </div>
      <p className="text-center text-[10px] text-cream/30">Lyrics from LRCLIB</p>
    </div>
  );
}
