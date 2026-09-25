"use client";

import { useEffect, useState } from "react";
import type { usePlaybackSync } from "@/hooks/usePlaybackSync";
import type { Favourite, QueueItem, Track } from "@/lib/types";
import { possessive } from "@/lib/format";
import { thumbUrl } from "@/lib/youtube";
import { Avatar } from "@/components/ui/Avatar";
import {
  ChevronDown,
  ChevronUp,
  HeartIcon,
  PauseIcon,
  PlayIcon,
  QueueIcon,
  RestartIcon,
  SearchIcon,
  SkipIcon,
} from "@/components/ui/Icons";
import { SeekBar } from "./SeekBar";
import { QueueList } from "./QueueList";
import { SearchPanel } from "./SearchPanel";
import { LibraryPanel, type RoomSong } from "./LibraryPanel";
import { LyricsPanel } from "./LyricsPanel";

type Player = ReturnType<typeof usePlaybackSync>;

type Props = {
  roomName: string;
  roomId: string;
  v2?: boolean;
  ourSongs: RoomSong[];
  onSaveOurSong?: (t: Track) => void;
  onRemoveOurSong: (id: string) => void;
  onReorder?: (ids: string[]) => void;
  autoplay?: boolean;
  onAutoplay?: (on: boolean) => void;
  onShareMoment?: () => void;
  onDedicate?: (t: Track) => void;
  player: Player;
  queue: QueueItem[];
  favourites: Favourite[];
  meId: string;
  nameOf: (userId: string | null | undefined) => string;
  isFavourite: (videoId: string | null | undefined) => boolean;
  onToggleFavourite: (t: Track) => void;
  onAddToQueue: (t: Track) => void;
  onRemoveFromQueue: (id: string) => void;
  onError: (msg: string) => void;
};

type Tab = "queue" | "search" | "library" | "lyrics";

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

export function PlayerPanel(props: Props) {
  const { player, queue, favourites, nameOf, isFavourite, onToggleFavourite } = props;
  const s = player.state;
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("queue");
  const [artFailed, setArtFailed] = useState<string | null>(null);
  const expanded = open || isDesktop;

  const current: Track | null = s?.videoId
    ? { videoId: s.videoId, title: s.title ?? "", channel: s.channel, thumbnail: s.thumbnail, durationSec: s.durationSec }
    : null;

  // Lock page scroll behind the full-screen sheet on phones.
  useEffect(() => {
    if (!open || isDesktop) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isDesktop]);

  const playPause = (size: number) => (
    <button
      onClick={player.togglePlay}
      disabled={!s?.videoId}
      aria-label={s?.isPlaying ? "Pause" : "Play"}
      className="flex shrink-0 items-center justify-center rounded-full bg-cream text-ink shadow-lg transition active:scale-90 disabled:opacity-40"
      style={{ width: size, height: size }}
    >
      {s?.isPlaying ? <PauseIcon size={size * 0.42} /> : <PlayIcon size={size * 0.42} className="translate-x-[1px]" />}
    </button>
  );

  // NOTE: the element tree is identical in both modes (only classes change), so the
  // YouTube iframe is never re-mounted when you expand/collapse the player.
  return (
    <section
      className={
        expanded
          ? "vv-fixed z-40 flex flex-col overflow-y-auto overscroll-contain bg-ink/95 backdrop-blur-2xl lg:static lg:z-auto lg:h-full lg:w-[min(46%,620px)] lg:shrink-0 lg:border-r lg:border-white/5 lg:bg-black/15 lg:backdrop-blur-none"
          : "sticky top-0 z-30 mx-3 mb-1 flex flex-col overflow-hidden rounded-2xl bg-black/35 ring-1 ring-white/10 backdrop-blur-xl"
      }
    >
      {/* Sheet header (phone, expanded only) */}
      <div className={expanded && !isDesktop ? "flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),12px)] pb-1" : "hidden"}>
        <button onClick={() => setOpen(false)} className="rounded-full p-2 text-cream/70 hover:bg-white/5" aria-label="Collapse player">
          <ChevronDown size={22} />
        </button>
        <span className="max-w-[60vw] truncate text-xs tracking-[0.2em] text-cream/50 uppercase">{props.roomName}</span>
        <span className="w-9" />
      </div>

      <div className={expanded ? "px-5 pt-3 lg:px-8 lg:pt-8" : "flex items-center gap-3 p-2"}>
        {/* Album art. The YouTube player still runs underneath (it has to stay on
            screen to keep playing) but is fully covered — audio only, no video. */}
        <div
          className={
            expanded
              ? "relative mx-auto aspect-square w-full max-w-[min(340px,72vw)] overflow-hidden rounded-[2rem] bg-black/40 shadow-[0_30px_80px_-20px_var(--c1)] ring-1 ring-white/10 lg:max-w-[380px]"
              : "relative aspect-square w-14 shrink-0 overflow-hidden rounded-xl bg-black/40"
          }
          onClick={() => !expanded && setOpen(true)}
        >
          <div ref={player.hostRef} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full" />
          {s?.videoId && artFailed !== s.videoId ? (
            // hqdefault has black bars top & bottom; scaling crops them for a clean square.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbUrl(s.videoId, "hq")}
              alt=""
              onError={() => setArtFailed(s.videoId)}
              className={`pointer-events-none absolute inset-0 h-full w-full scale-[1.34] object-cover transition duration-700 ${
                s.isPlaying ? "" : "brightness-75 saturate-50"
              }`}
            />
          ) : (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#1d1419] text-center text-cream/50">
              <span className={expanded ? "text-5xl" : "text-xl"}>🎶</span>
              {expanded && <span className="px-6 text-sm">Search a song to start your duet</span>}
            </div>
          )}
          {/* Shield: stops taps from reaching YouTube (which would desync). Dropped when an
              iPhone insists on one tap inside the player — the tap passes through the art. */}
          <div className={player.needsTap ? "pointer-events-none absolute inset-0" : "absolute inset-0"} />
          {player.needsTap && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 p-3 text-center text-xs font-medium text-cream">
              {expanded ? "Tap here once to start sound on this phone" : "Tap"}
            </div>
          )}
        </div>

        {/* Title + meta */}
        <div className={expanded ? "mt-5 flex items-start gap-3" : "min-w-0 flex-1"} onClick={() => !expanded && setOpen(true)}>
          <div className="min-w-0 flex-1">
            <h2 className={expanded ? "font-display text-2xl leading-tight italic lg:text-3xl" : "truncate text-sm font-semibold"}>
              {s?.title || "Nothing playing"}
            </h2>
            <div className={`flex items-center gap-1.5 text-cream/60 ${expanded ? "mt-1.5 text-sm" : "mt-0.5 text-xs"}`}>
              {s?.addedBy ? (
                <>
                  <Avatar userId={s.addedBy} name={nameOf(s.addedBy)} size={expanded ? 18 : 14} />
                  <span className="truncate">
                    {possessive(nameOf(s.addedBy))} pick{expanded && s.channel ? ` · ${s.channel}` : ""}
                  </span>
                </>
              ) : (
                <span className="truncate">{player.needsTap && !expanded ? "Tap to start sound" : (s?.channel ?? "Your shared queue")}</span>
              )}
            </div>
          </div>
          {expanded && current && (
            <button
              onClick={() => onToggleFavourite(current)}
              className={`mt-1 rounded-full p-2 transition active:scale-90 ${isFavourite(current.videoId) ? "text-rose-400" : "text-cream/60 hover:text-cream"}`}
              aria-label="Favourite"
            >
              <HeartIcon size={24} filled={isFavourite(current.videoId)} />
            </button>
          )}
        </div>

        {/* Collapsed controls */}
        <div className={expanded ? "hidden" : "flex items-center gap-1"}>
          {playPause(40)}
          <button onClick={() => setOpen(true)} className="rounded-full p-2 text-cream/70" aria-label="Open player">
            <ChevronUp size={20} />
          </button>
        </div>

        {/* Expanded controls */}
        {expanded && (
          <div className="mt-4">
            <SeekBar getPosition={player.getPosition} duration={s?.durationSec ?? null} isPlaying={!!s?.isPlaying} disabled={!s?.videoId} onSeek={player.seek} />
            <div className="mt-3 flex items-center justify-center gap-8">
              <button onClick={() => player.seek(0)} disabled={!s?.videoId} className="rounded-full p-3 text-cream/80 transition active:scale-90 disabled:opacity-30" aria-label="Restart">
                <RestartIcon size={24} />
              </button>
              {playPause(68)}
              <button onClick={player.skip} disabled={!s?.videoId} className="rounded-full p-3 text-cream/80 transition active:scale-90 disabled:opacity-30" aria-label="Skip">
                <SkipIcon size={24} />
              </button>
            </div>
            <VolumeRow volume={player.volume} onChange={player.setVolume} />
            {props.v2 && current && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <button
                  onClick={props.onShareMoment}
                  className="rounded-full bg-white/8 px-3.5 py-1.5 text-[13px] font-medium text-cream/85 ring-1 ring-white/10 active:scale-95"
                >
                  💬 Share this moment
                </button>
                {props.onSaveOurSong && !props.ourSongs.some((o) => o.video_id === current.videoId) && (
                  <button
                    onClick={() => props.onSaveOurSong!(current)}
                    className="rounded-full bg-white/8 px-3.5 py-1.5 text-[13px] font-medium text-cream/85 ring-1 ring-white/10 active:scale-95"
                  >
                    🎶 Save to Our Songs
                  </button>
                )}
                {props.onDedicate && (
                  <button
                    onClick={() => props.onDedicate!(current)}
                    className="rounded-full bg-white/8 px-3.5 py-1.5 text-[13px] font-medium text-cream/85 ring-1 ring-white/10 active:scale-95"
                  >
                    💌 Dedicate
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mini progress line (collapsed) */}
      {!expanded && s?.videoId && <MiniProgress getPosition={player.getPosition} duration={s.durationSec} />}

      {/* Queue / Search / Favourites */}
      {expanded && (
        <div className="mt-6 flex min-h-0 flex-1 flex-col px-3 pb-[max(env(safe-area-inset-bottom),16px)] lg:px-6">
          <div className="mx-2 flex gap-1 rounded-full bg-white/5 p-1 ring-1 ring-white/5">
            {(
              [
                ["queue", "Up next", <QueueIcon key="q" size={15} />, queue.length],
                ["search", "Search", <SearchIcon key="s" size={15} />, 0],
                ["library", "Library", <HeartIcon key="f" size={15} />, 0],
                ["lyrics", "Lyrics", <span key="l" className="text-[13px] leading-none">🎤</span>, 0],
              ] as const
            ).map(([id, label, icon, count]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-medium transition ${
                  tab === id ? "bg-cream text-ink shadow" : "text-cream/65 hover:text-cream"
                }`}
              >
                {icon}
                {label}
                {count > 0 && <span className={`text-[11px] ${tab === id ? "text-ink/60" : "text-cream/40"}`}>{count}</span>}
              </button>
            ))}
          </div>
          <div className="mt-3 min-h-0 flex-1">
            {tab === "queue" && (
              <QueueList
                queue={queue}
                nameOf={nameOf}
                onPlay={(id) => player.playQueueItem(id)}
                onRemove={props.onRemoveFromQueue}
                onSearch={() => setTab("search")}
                onReorder={props.v2 ? props.onReorder : undefined}
                autoplay={props.autoplay}
                onAutoplay={props.v2 ? props.onAutoplay : undefined}
              />
            )}
            {tab === "search" && (
              <SearchPanel
                onDedicate={props.v2 ? props.onDedicate : undefined}
                isFavourite={isFavourite}
                onPlay={(t) => player.playTrack(t)}
                onQueue={props.onAddToQueue}
                onToggleFavourite={onToggleFavourite}
                onError={props.onError}
              />
            )}
            {tab === "library" && (
              <LibraryPanel
                roomId={props.roomId}
                v2={!!props.v2}
                favourites={favourites}
                ourSongs={props.ourSongs}
                nameOf={nameOf}
                onPlay={(t, by) => player.playTrack(t, by ?? undefined)}
                onQueue={props.onAddToQueue}
                onToggleFavourite={onToggleFavourite}
                onRemoveOurSong={props.onRemoveOurSong}
              />
            )}
            {tab === "lyrics" && <LyricsPanel state={s} getPosition={player.getPosition} />}
          </div>
        </div>
      )}
    </section>
  );
}

function MiniProgress({ getPosition, duration }: { getPosition: () => number; duration: number | null }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPct(duration ? Math.min(100, (getPosition() / duration) * 100) : 0), 500);
    return () => clearInterval(t);
  }, [getPosition, duration]);
  return (
    <div className="h-[3px] w-full bg-white/10">
      <div className="h-full bg-cream/80 transition-[width] duration-500 ease-linear" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Your own volume (not synced). iPhones only allow the side buttons, so it's hidden there. */
function VolumeRow({ volume, onChange }: { volume: number; onChange: (v: number) => void }) {
  const [ios, setIos] = useState(true);
  useEffect(() => {
    const ua = navigator.userAgent;
    setIos(/iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document));
  }, []);
  if (ios) return null;
  return (
    <div className="mt-2 flex items-center gap-3 px-1 text-cream/55">
      <span className="text-sm" aria-hidden>
        {volume === 0 ? "🔇" : volume < 50 ? "🔉" : "🔊"}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={volume}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Volume (just for you)"
        className="duet-range flex-1"
        style={{ "--pct": `${volume}%` } as React.CSSProperties}
      />
    </div>
  );
}
