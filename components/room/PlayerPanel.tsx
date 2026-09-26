"use client";

import { useEffect, useRef, useState } from "react";
import { useBackToClose } from "@/lib/backStack";
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
  onImport?: (tracks: Track[], where: "queue" | "ours" | "mine") => Promise<void>;
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
  const [sheet, setSheet] = useState(false); // phone: Up next / Search / Library slide-up
  const [lyrics, setLyrics] = useState(false); // lyrics shown in place of the album art
  const [artFailed, setArtFailed] = useState<string | null>(null);
  const [pull, setPull] = useState(0); // swipe-down-to-close distance
  const [pulling, setPulling] = useState(false);
  const pullStart = useRef<number | null>(null);
  const expanded = open || isDesktop;
  const showLyrics = lyrics && expanded && !player.needsTap;

  const current: Track | null = s?.videoId
    ? { videoId: s.videoId, title: s.title ?? "", channel: s.channel, thumbnail: s.thumbnail, durationSec: s.durationSec }
    : null;
  const saved = !!current && props.ourSongs.some((o) => o.video_id === current.videoId);

  // Android back: closes the lists sheet first, then the full-screen player.
  useBackToClose(open && !isDesktop, () => {
    setSheet(false);
    setOpen(false);
    setPull(0);
  });
  useBackToClose(sheet && open && !isDesktop, () => setSheet(false));

  const close = () => {
    setSheet(false);
    setOpen(false);
    setPull(0);
  };
  const openTab = (t: Tab) => {
    setTab(t);
    if (!isDesktop) setSheet(true);
  };
  // Playing something from the lists takes you back to the Now Playing screen.
  const playAndShow = (fn: () => void) => {
    fn();
    setSheet(false);
  };

  const dragHandlers = isDesktop || !open || showLyrics
    ? {}
    : {
        onTouchStart: (e: React.TouchEvent) => {
          pullStart.current = e.touches[0].clientY;
          setPulling(true);
        },
        onTouchMove: (e: React.TouchEvent) => {
          if (pullStart.current == null) return;
          setPull(Math.max(0, e.touches[0].clientY - pullStart.current));
        },
        onTouchEnd: () => {
          pullStart.current = null;
          setPulling(false);
          if (pull > 110) close();
          else setPull(0);
        },
      };

  const playPause = (size: number, variant: "solid" | "ghost" = "solid") => (
    <button
      onClick={player.togglePlay}
      disabled={!s?.videoId}
      aria-label={s?.isPlaying ? "Pause" : "Play"}
      className={`flex shrink-0 items-center justify-center rounded-full transition active:scale-90 disabled:opacity-40 ${
        variant === "solid" ? "bg-cream text-ink shadow-[0_12px_40px_-8px_var(--c1)]" : "text-cream"
      }`}
      style={{ width: size, height: size }}
    >
      {s?.isPlaying ? <PauseIcon size={size * 0.42} /> : <PlayIcon size={size * 0.42} className="translate-x-[1px]" />}
    </button>
  );

  const tabs = [
    ["queue", "Up next", <QueueIcon key="q" size={16} />, queue.length],
    ["search", "Search", <SearchIcon key="s" size={16} />, 0],
    ["library", "Library", <HeartIcon key="f" size={16} />, 0],
  ] as const;

  const lists = (
    <>
      {tab === "queue" && (
        <QueueList
          queue={queue}
          nameOf={nameOf}
          onPlay={(id) => playAndShow(() => player.playQueueItem(id))}
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
          onPlay={(t) => playAndShow(() => player.playTrack(t))}
          onQueue={props.onAddToQueue}
          onToggleFavourite={onToggleFavourite}
          onError={props.onError}
          onImport={props.onImport}
        />
      )}
      {tab === "library" && (
        <LibraryPanel
          roomId={props.roomId}
          v2={!!props.v2}
          favourites={favourites}
          ourSongs={props.ourSongs}
          nameOf={nameOf}
          onPlay={(t, by) => playAndShow(() => player.playTrack(t, by ?? undefined))}
          onQueue={props.onAddToQueue}
          onToggleFavourite={onToggleFavourite}
          onRemoveOurSong={props.onRemoveOurSong}
        />
      )}
    </>
  );

  const tabRow = (inSheet: boolean) => (
    <div className={`flex gap-1 rounded-full bg-white/6 p-1 ring-1 ring-white/8 ${inSheet ? "" : "mx-auto w-full max-w-md"}`}>
      {tabs.map(([id, label, icon, count]) => {
        const active = (inSheet || isDesktop) && tab === id;
        return (
          <button
            key={id}
            onClick={() => (inSheet ? setTab(id) : openTab(id))}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-[13px] font-medium transition active:scale-95 ${
              active ? "bg-cream text-ink shadow" : "text-cream/75 hover:text-cream"
            }`}
          >
            {icon}
            {label}
            {count > 0 && <span className={`text-[11px] ${active ? "text-ink/60" : "text-cream/45"}`}>{count}</span>}
          </button>
        );
      })}
    </div>
  );

  // NOTE: the album-art box (which hosts the YouTube iframe) sits at the same place in the
  // tree in every mode, so the player is never re-mounted when you open or close things.
  return (
    <section
      className={
        expanded
          ? "vv-fixed z-40 flex flex-col overflow-clip bg-ink lg:static lg:z-auto lg:h-full lg:w-[min(46%,620px)] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-white/5 lg:bg-black/15"
          : "sticky top-0 z-30 mx-3 mb-1 flex flex-col overflow-clip rounded-2xl bg-black/35 ring-1 ring-white/10 backdrop-blur-xl"
      }
      style={
        expanded && !isDesktop && pull
          ? { transform: `translateY(${pull}px)`, borderRadius: Math.min(28, pull / 4), transition: pulling ? "none" : "transform .2s" }
          : undefined
      }
    >
      {/* Blurred cover behind everything — the screen takes on the song's colours. */}
      {expanded && s?.videoId && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl(s.videoId, "hq")}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-45 blur-3xl saturate-150 lg:hidden"
        />
      )}
      {expanded && <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink/30 via-ink/55 to-ink/95 lg:hidden" />}

      {/* Header (phone, expanded) */}
      <div
        {...dragHandlers}
        className={
          expanded && !isDesktop
            ? "relative flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),10px)] pb-1"
            : "hidden"
        }
      >
        <button onClick={close} className="rounded-full p-2.5 text-cream/80 active:bg-white/10" aria-label="Collapse player">
          <ChevronDown size={24} />
        </button>
        <div className="min-w-0 flex-1 text-center leading-tight">
          <div className="text-[10px] font-semibold tracking-[0.22em] text-cream/45 uppercase">Playing together</div>
          <div className="truncate font-display text-[15px] text-cream/90 italic">{props.roomName}</div>
        </div>
        <button
          onClick={() => setLyrics((l) => !l)}
          aria-label={lyrics ? "Show album art" : "Show lyrics"}
          aria-pressed={lyrics}
          className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition active:scale-95 ${
            lyrics ? "bg-cream text-ink" : "bg-white/10 text-cream/85 ring-1 ring-white/10"
          }`}
        >
          Lyrics
        </button>
      </div>

      <div
        className={
          expanded
            ? "relative flex min-h-0 flex-1 flex-col px-6 pb-[max(env(safe-area-inset-bottom),14px)] lg:flex-none lg:px-8 lg:pt-8 lg:pb-4"
            : "flex items-center gap-3 p-2"
        }
      >
        {/* Art area: grows to fill whatever height is left (phone). */}
        <div
          {...dragHandlers}
          className={expanded ? "np-art-box relative flex min-h-[120px] flex-1 items-center justify-center py-3 lg:min-h-0 lg:flex-none" : "contents"}
        >
          {/* Album art. The YouTube player runs underneath (it has to stay on screen to
              keep playing) but is fully covered — audio only, no video. */}
          <div
            className={
              expanded
                ? `np-art relative overflow-hidden rounded-[1.75rem] bg-black/40 shadow-[0_30px_80px_-20px_var(--c1)] ring-1 ring-white/10 transition-[transform,opacity] duration-500 ${
                    s?.isPlaying ? "scale-100" : "scale-[0.94]"
                  } ${showLyrics ? "opacity-0" : ""}`
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
          {showLyrics && (
            <div className="absolute inset-0 py-2">
              <LyricsPanel state={s} getPosition={player.getPosition} fill />
            </div>
          )}
        </div>

        {/* Title + meta */}
        <div className={expanded ? "mt-2 flex items-center gap-3" : "min-w-0 flex-1"} onClick={() => !expanded && setOpen(true)}>
          <div className="min-w-0 flex-1">
            <h2 className={expanded ? "line-clamp-2 font-display text-[26px] leading-[1.1] italic lg:text-3xl" : "truncate text-sm font-semibold"}>
              {s?.title || "Nothing playing"}
            </h2>
            <div className={`flex items-center gap-1.5 text-cream/60 ${expanded ? "mt-2 text-[13px]" : "mt-0.5 text-xs"}`}>
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
              className={`flex size-11 shrink-0 items-center justify-center rounded-full bg-white/8 ring-1 ring-white/10 transition active:scale-90 ${
                isFavourite(current.videoId) ? "text-rose-400" : "text-cream/75"
              }`}
              aria-label="Favourite"
            >
              <HeartIcon size={22} filled={isFavourite(current.videoId)} />
            </button>
          )}
        </div>

        {/* Collapsed controls */}
        <div className={expanded ? "hidden" : "flex items-center gap-0.5"}>
          {playPause(40)}
          <button onClick={player.skip} disabled={!s?.videoId} className="rounded-full p-2.5 text-cream/75 active:scale-90 disabled:opacity-30" aria-label="Skip">
            <SkipIcon size={20} />
          </button>
          <button onClick={() => setOpen(true)} className="rounded-full p-2.5 text-cream/60" aria-label="Open player">
            <ChevronUp size={20} />
          </button>
        </div>

        {/* Expanded controls */}
        {expanded && (
          <div className="mt-4">
            <SeekBar getPosition={player.getPosition} duration={s?.durationSec ?? null} isPlaying={!!s?.isPlaying} disabled={!s?.videoId} onSeek={player.seek} />
            <div className="mt-2 flex items-center justify-center gap-10">
              <button onClick={() => player.seek(0)} disabled={!s?.videoId} className="rounded-full p-3 text-cream/85 transition active:scale-90 disabled:opacity-30" aria-label="Restart">
                <RestartIcon size={26} />
              </button>
              {playPause(74)}
              <button onClick={player.skip} disabled={!s?.videoId} className="rounded-full p-3 text-cream/85 transition active:scale-90 disabled:opacity-30" aria-label="Skip">
                <SkipIcon size={26} />
              </button>
            </div>
            <VolumeRow volume={player.volume} onChange={player.setVolume} />
            {props.v2 && current && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Action emoji="💬" label="Share moment" onClick={props.onShareMoment} />
                <Action
                  emoji={saved ? "✅" : "🎶"}
                  label={saved ? "In Our Songs" : "Our Songs"}
                  onClick={saved || !props.onSaveOurSong ? undefined : () => props.onSaveOurSong!(current)}
                />
                <Action emoji="💌" label="Dedicate" onClick={props.onDedicate ? () => props.onDedicate!(current) : undefined} />
              </div>
            )}
            {/* (not rendered under the open sheet, so each tab exists once) */}
            <div className="mt-4">{sheet && !isDesktop ? <div className="h-[46px]" /> : tabRow(false)}</div>
          </div>
        )}
      </div>

      {/* Mini progress line (collapsed) */}
      {!expanded && s?.videoId && <MiniProgress getPosition={player.getPosition} duration={s.durationSec} />}

      {/* Desktop: lists sit right under the player. */}
      {isDesktop && <div className="min-h-0 flex-1 px-4 pb-6 lg:px-6">{lists}</div>}

      {/* Phone: lists slide up over the Now Playing screen. */}
      {!isDesktop && open && sheet && (
        <div className="vv-fixed z-50 flex flex-col">
          <button className="h-[max(env(safe-area-inset-top),16px)] shrink-0" aria-label="Back to player" onClick={() => setSheet(false)} />
          <div className="animate-sheet flex min-h-0 flex-1 flex-col rounded-t-[1.75rem] bg-[#181015]/[0.98] shadow-[0_-20px_60px_rgb(0_0_0/0.5)] ring-1 ring-white/10 backdrop-blur-2xl">
            <div className="px-4 pt-2 pb-3">
              <div className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-white/20" />
              {/* Keep control of the song while you browse. */}
              <div className="mb-3 flex items-center gap-3">
                <button onClick={() => setSheet(false)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label="Back to player">
                  {s?.videoId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbUrl(s.videoId)} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/8">🎶</span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{s?.title || "Nothing playing"}</span>
                    <span className="block text-xs text-cream/50">Tap to go back to the player</span>
                  </span>
                </button>
                {playPause(40)}
              </div>
              {tabRow(true)}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(env(safe-area-inset-bottom),16px)]">{lists}</div>
          </div>
        </div>
      )}
    </section>
  );
}

function Action({ emoji, label, onClick }: { emoji: string; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="flex flex-col items-center gap-1 rounded-2xl bg-white/6 py-2.5 text-[12px] font-medium text-cream/85 ring-1 ring-white/8 transition active:scale-95 disabled:opacity-60"
    >
      <span className="text-lg leading-none">{emoji}</span>
      {label}
    </button>
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
