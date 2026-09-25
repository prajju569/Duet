"use client";

import { thumbUrl } from "@/lib/youtube";
import { formatTime } from "@/lib/format";

type Props = {
  videoId: string;
  title: string;
  subtitle?: React.ReactNode;
  durationSec?: number | null;
  onPlay: () => void;
  actions?: React.ReactNode;
};

export function TrackRow({ videoId, title, subtitle, durationSec, onPlay, actions }: Props) {
  return (
    <li className="group flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-white/5">
      <button onClick={onPlay} className="relative shrink-0 overflow-hidden rounded-xl active:scale-95" aria-label={`Play ${title}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbUrl(videoId)} alt="" loading="lazy" className="h-12 w-[4.25rem] object-cover" />
        {durationSec ? (
          <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-[10px] tabular-nums text-cream">{formatTime(durationSec)}</span>
        ) : null}
      </button>
      <button onClick={onPlay} className="min-w-0 flex-1 text-left">
        <div className="line-clamp-2 text-[13.5px] leading-snug font-medium">{title}</div>
        {subtitle && <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-cream/55">{subtitle}</div>}
      </button>
      {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
    </li>
  );
}

export function IconButton({ onClick, label, children, active }: { onClick: () => void; label: string; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`rounded-full p-2 transition active:scale-90 ${active ? "text-rose-400" : "text-cream/55 hover:bg-white/8 hover:text-cream"}`}
    >
      {children}
    </button>
  );
}
