"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Message } from "@/lib/types";
import { signedUrl } from "@/lib/media";
import { formatTime } from "@/lib/format";

function useMediaUrl(m: Message) {
  const [url, setUrl] = useState<string | null>(m.localUrl ?? null);
  useEffect(() => {
    if (m.localUrl) return setUrl(m.localUrl);
    const path = m.meta?.path;
    if (!path) return;
    let alive = true;
    signedUrl(path).then((u) => alive && u && setUrl(u));
    return () => {
      alive = false;
    };
  }, [m.localUrl, m.meta?.path]);
  return url;
}

export function ImageMessage({ m }: { m: Message }) {
  const url = useMediaUrl(m);
  const [open, setOpen] = useState(false);
  const w = m.meta?.width || 4, h = m.meta?.height || 3;
  return (
    <>
      <button
        type="button"
        onClick={() => url && setOpen(true)}
        aria-label="Open photo"
        className="-mx-2 -mt-0.5 mb-1 block w-60 max-w-[65vw] overflow-hidden rounded-2xl bg-black/20"
        style={{ aspectRatio: `${w} / ${h}` }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Photo" className={`h-full w-full object-cover ${m.pending ? "opacity-60" : ""}`} />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-2xl opacity-50">📷</span>
        )}
      </button>
      {open &&
        url &&
        // Portal: bubbles use blur/transform, which would trap a fixed overlay inside them.
        createPortal(
          <div className="vv-fixed z-[80] flex items-center justify-center bg-black/95 p-3" onClick={() => setOpen(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Photo" className="max-h-full max-w-full rounded-xl object-contain" />
            <button className="absolute top-[max(env(safe-area-inset-top),14px)] right-4 rounded-full bg-white/15 px-3 py-1.5 text-sm text-cream">Close</button>
          </div>,
          document.body,
        )}
    </>
  );
}

export function VoiceMessage({ m, mine }: { m: Message; mine: boolean }) {
  const url = useMediaUrl(m);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [rate, setRate] = useState(1);
  const total = m.meta?.seconds ?? 0;
  const peaks = m.meta?.peaks;

  useEffect(() => () => audio.current?.pause(), []);

  const toggle = () => {
    if (!url) return;
    if (!audio.current) {
      const a = new Audio(url);
      a.ontimeupdate = () => setPos(a.currentTime);
      a.onended = () => {
        setPlaying(false);
        setPos(0);
        window.dispatchEvent(new CustomEvent("duet:duck", { detail: false }));
      };
      audio.current = a;
    }
    const a = audio.current;
    a.playbackRate = rate;
    if (a.paused) {
      window.dispatchEvent(new CustomEvent("duet:duck", { detail: true })); // soften the music
      void a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
      window.dispatchEvent(new CustomEvent("duet:duck", { detail: false }));
    }
  };

  const pct = total ? Math.min(100, (pos / total) * 100) : 0;
  return (
    <span className="flex w-52 max-w-full items-center gap-3 whitespace-normal">
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={toggle}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        disabled={!url}
        className={`flex size-10 shrink-0 items-center justify-center rounded-full text-base ${mine ? "bg-ink/15 text-ink" : "bg-white/15 text-cream"} disabled:opacity-40`}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <span className="min-w-0 flex-1">
        {peaks?.length ? (
          <span className="flex h-7 items-center gap-[2px]" aria-hidden>
            {peaks.map((h, i) => (
              <span
                key={i}
                className={`w-[3px] flex-1 rounded-full ${
                  (i + 0.5) / peaks.length <= pct / 100 ? (mine ? "bg-ink/70" : "bg-cream/90") : mine ? "bg-ink/25" : "bg-white/25"
                }`}
                style={{ height: `${h}%` }}
              />
            ))}
          </span>
        ) : (
          <span className={`block h-1.5 overflow-hidden rounded-full ${mine ? "bg-ink/15" : "bg-white/15"}`}>
            <span className={`block h-full rounded-full ${mine ? "bg-ink/60" : "bg-cream/80"}`} style={{ width: `${pct}%` }} />
          </span>
        )}
        <span className={`mt-1 flex items-center justify-between text-[11px] ${mine ? "text-ink/60" : "text-cream/55"}`}>
          <span>🎤 {formatTime(playing || pos ? pos : total)}</span>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
              setRate(next);
              if (audio.current) audio.current.playbackRate = next;
            }}
            aria-label={`Playback speed ${rate}×`}
            className={`rounded-full px-1.5 py-px text-[10.5px] font-bold ${mine ? "bg-ink/15" : "bg-white/15"}`}
          >
            {rate}×
          </button>
        </span>
      </span>
    </span>
  );
}
