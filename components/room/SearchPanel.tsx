"use client";

import { useRef, useState } from "react";
import type { Track } from "@/lib/types";
import { HeartIcon, PlusIcon, SearchIcon } from "@/components/ui/Icons";
import { IconButton, TrackRow } from "./TrackRow";

type Props = {
  isFavourite: (videoId: string) => boolean;
  onPlay: (t: Track) => void;
  onQueue: (t: Track) => void;
  onToggleFavourite: (t: Track) => void;
  onError: (msg: string) => void;
};

// Keep results while switching tabs.
let lastQuery = "";
let lastResults: Track[] = [];

export function SearchPanel({ isFavourite, onPlay, onQueue, onToggleFavourite, onError }: Props) {
  const [q, setQ] = useState(lastQuery);
  const [results, setResults] = useState<Track[]>(lastResults);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search on submit (not per keystroke) — each YouTube search costs quota.
  async function search(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    inputRef.current?.blur();
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Search failed");
      lastQuery = query;
      lastResults = json.items;
      setResults(json.items);
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
          placeholder="Kesariya, Arijit, lofi…"
          enterKeyHint="search"
          className="h-11 min-w-0 flex-1 bg-transparent text-base placeholder:text-cream/35 focus:outline-none"
        />
        {loading && <span className="size-4 animate-spin rounded-full border-2 border-cream/30 border-t-cream" />}
      </form>

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
