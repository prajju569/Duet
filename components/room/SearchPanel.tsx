"use client";

import { useRef, useState } from "react";
import { parsePlaylistLink, parseYouTubeId } from "@/lib/youtubeUrl";
import type { Track } from "@/lib/types";
import { HeartIcon, PlusIcon, SearchIcon } from "@/components/ui/Icons";
import { IconButton, TrackRow } from "./TrackRow";

type Props = {
  onDedicate?: (t: Track) => void;
  isFavourite: (videoId: string) => boolean;
  onPlay: (t: Track) => void;
  onQueue: (t: Track) => void;
  onToggleFavourite: (t: Track) => void;
  onError: (msg: string) => void;
  /** Bulk actions for an imported playlist. */
  onImport?: (tracks: Track[], where: "queue" | "ours" | "mine") => Promise<void>;
};

type Imported = { title: string; skipped: number; truncated: boolean };

// Keep results while switching tabs.
let lastQuery = "";
let lastResults: Track[] = [];
let lastPlaylist: Imported | null = null;
const isLink = (t: string) => !!parseYouTubeId(t) || !!parsePlaylistLink(t);

export function SearchPanel({ isFavourite, onPlay, onQueue, onToggleFavourite, onError, onDedicate, onImport }: Props) {
  const [q, setQ] = useState(lastQuery);
  const [results, setResults] = useState<Track[]>(lastResults);
  const [loading, setLoading] = useState(false);
  const [playlist, setPlaylist] = useState<Imported | null>(lastPlaylist);
  const [importing, setImporting] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search on submit (not per keystroke) — each YouTube search costs quota.
  async function search(e: React.FormEvent) {
    e.preventDefault();
    await runSearch(q.trim());
  }

  async function runSearch(query: string) {
    if (!query) return;
    setLoading(true);
    inputRef.current?.blur();
    try {
      // A playlist / album link → all its songs. A song link → that exact video (no search quota).
      const list = parsePlaylistLink(query);
      if (list && "error" in list) throw new Error(list.error);
      const linkId = list ? null : parseYouTubeId(query);
      const res = await fetch(
        list ? `/api/playlist?id=${list.id}` : linkId ? `/api/oembed?id=${linkId}` : `/api/search?q=${encodeURIComponent(query)}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Search failed");
      if (list && !json.items.length) throw new Error("No playable songs in that playlist.");
      lastQuery = query;
      lastResults = json.items;
      lastPlaylist = list ? { title: json.title, skipped: json.skipped, truncated: json.truncated } : null;
      setResults(json.items);
      setPlaylist(lastPlaylist);
      setDone([]);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={search} className="mx-2 flex items-center gap-2 rounded-full bg-white/8 px-4 ring-1 ring-white/10 focus-within:ring-white/30">
        <SearchIcon size={16} className="text-cream/50" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text");
            if (isLink(pasted)) {
              e.preventDefault();
              setQ(pasted.trim());
              void runSearch(pasted.trim());
            }
          }}
          placeholder="Kesariya, Arijit… or paste a song / playlist link"
          enterKeyHint="search"
          className="h-11 min-w-0 flex-1 bg-transparent text-base placeholder:text-cream/35 focus:outline-none"
        />
        {loading && <span className="size-4 animate-spin rounded-full border-2 border-cream/30 border-t-cream" />}
      </form>

      {playlist && onImport && (
        <div className="animate-rise mx-2 mt-3 rounded-2xl bg-white/6 p-3.5 ring-1 ring-white/10">
          <div className="text-[11px] font-semibold tracking-wide text-cream/45 uppercase">Playlist</div>
          <div className="truncate font-display text-lg italic">{playlist.title}</div>
          <div className="text-xs text-cream/50">
            {results.length} songs
            {playlist.skipped ? ` · ${playlist.skipped} can't play outside YouTube, skipped` : ""}
            {playlist.truncated ? " · first 200 only" : ""}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                ["queue", "➕", "Add all to Up next"],
                ["ours", "🎶", "Save to Our Songs"],
                ["mine", "♥", "Save to my favourites"],
              ] as const
            ).map(([where, icon, label]) => (
              <button
                key={where}
                disabled={!!importing || done.includes(where)}
                onClick={async () => {
                  setImporting(where);
                  await onImport(results, where);
                  setImporting(null);
                  setDone((d) => [...d, where]);
                }}
                className="flex flex-col items-center gap-1 rounded-xl bg-white/8 px-1 py-2 text-[11.5px] leading-tight font-medium ring-1 ring-white/10 transition active:scale-95 disabled:opacity-50"
              >
                <span className="text-base leading-none">{importing === where ? "⏳" : done.includes(where) ? "✅" : icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <ul className="mt-3 space-y-0.5">
        {results.map((t) => (
          <TrackRow
            key={t.videoId}
            videoId={t.videoId}
            title={t.title}
            subtitle={t.channel}
            durationSec={t.durationSec}
            onPlay={() => onPlay(t)}
            actions={
              <>
                <IconButton onClick={() => onQueue(t)} label="Add to queue">
                  <PlusIcon size={17} />
                </IconButton>
                {onDedicate && (
                  <IconButton onClick={() => onDedicate(t)} label="Dedicate">
                    <span className="text-[15px] leading-none">💌</span>
                  </IconButton>
                )}
                <IconButton onClick={() => onToggleFavourite(t)} label="Favourite" active={isFavourite(t.videoId)}>
                  <HeartIcon size={16} filled={isFavourite(t.videoId)} />
                </IconButton>
              </>
            }
          />
        ))}
      </ul>
      {!results.length && !loading && (
        <p className="px-6 py-8 text-center text-sm text-cream/45">Tap a result to play it for both of you, or + to queue it.</p>
      )}
    </div>
  );
}
