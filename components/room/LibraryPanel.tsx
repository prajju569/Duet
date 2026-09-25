"use client";

import { useEffect, useState } from "react";
import type { Favourite, Track } from "@/lib/types";
import { getSupabase } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { PlusIcon, XIcon } from "@/components/ui/Icons";
import { IconButton, TrackRow } from "./TrackRow";
import { FavouritesList } from "./FavouritesList";

export type RoomSong = {
  id: string;
  room_id: string;
  video_id: string;
  title: string;
  channel: string | null;
  thumbnail: string | null;
  duration_sec: number | null;
  added_by: string | null;
  created_at: string;
};
type HistoryRow = { video_id: string; title: string; channel: string | null; duration_sec: number | null; plays: number; first_played: string; last_played: string };

const toTrack = (x: { video_id: string; title: string; channel: string | null; thumbnail?: string | null; duration_sec: number | null }): Track => ({
  videoId: x.video_id,
  title: x.title,
  channel: x.channel,
  thumbnail: x.thumbnail ?? null,
  durationSec: x.duration_sec,
});

const shortDate = (iso: string) => new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });

type Props = {
  roomId: string;
  v2: boolean;
  favourites: Favourite[];
  ourSongs: RoomSong[];
  nameOf: (id: string | null | undefined) => string;
  onPlay: (t: Track, addedBy?: string | null) => void;
  onQueue: (t: Track) => void;
  onToggleFavourite: (t: Track) => void;
  onRemoveOurSong: (id: string) => void;
};

/** Favourites (yours) · Our Songs (shared) · History (everything you've played together). */
export function LibraryPanel(props: Props) {
  const [seg, setSeg] = useState<"fav" | "ours" | "history">("fav");
  const [history, setHistory] = useState<HistoryRow[] | null>(null);

  useEffect(() => {
    if (seg !== "history") return;
    let alive = true;
    getSupabase()
      .rpc("room_history", { p_room: props.roomId })
      .then(({ data }) => alive && setHistory((data ?? []) as HistoryRow[]));
    return () => {
      alive = false;
    };
  }, [seg, props.roomId]);

  const segs = [
    ["fav", `Mine ♥`],
    ...(props.v2 ? ([["ours", "Our Songs"], ["history", "History"]] as const) : []),
  ] as const;

  return (
    <div>
      {segs.length > 1 && (
        <div className="mx-2 mb-2 flex gap-4 border-b border-white/5 px-2 text-[13px]">
          {segs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSeg(id as typeof seg)}
              className={`-mb-px border-b-2 pb-2 font-medium transition ${seg === id ? "border-cream text-cream" : "border-transparent text-cream/50"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {seg === "fav" && (
        <FavouritesList favourites={props.favourites} onPlay={(t) => props.onPlay(t)} onQueue={props.onQueue} onToggleFavourite={props.onToggleFavourite} />
      )}

      {seg === "ours" &&
        (props.ourSongs.length ? (
          <ul className="space-y-0.5">
            {props.ourSongs.map((s) => (
              <TrackRow
                key={s.id}
                videoId={s.video_id}
                title={s.title}
                durationSec={s.duration_sec}
                onPlay={() => props.onPlay(toTrack(s), s.added_by)}
                subtitle={
                  <>
                    <Avatar userId={s.added_by} name={props.nameOf(s.added_by)} size={15} />
                    <span>saved by {props.nameOf(s.added_by)}</span>
                  </>
                }
                actions={
                  <>
                    <IconButton onClick={() => props.onQueue(toTrack(s))} label="Add to queue">
                      <PlusIcon size={17} />
                    </IconButton>
                    <IconButton onClick={() => props.onRemoveOurSong(s.id)} label="Remove from Our Songs">
                      <XIcon size={15} />
                    </IconButton>
                  </>
                }
              />
            ))}
          </ul>
        ) : (
          <p className="px-6 py-10 text-center text-sm text-cream/50">
            Your shared playlist is empty. Tap <b>🎶 Save to Our Songs</b> on anything that becomes <i>your</i> song.
          </p>
        ))}

      {seg === "history" &&
        (history === null ? (
          <p className="px-6 py-10 text-center text-sm text-cream/45">Loading…</p>
        ) : history.length ? (
          <ul className="space-y-0.5">
            {history.map((h) => (
              <TrackRow
                key={h.video_id}
                videoId={h.video_id}
                title={h.title}
                durationSec={h.duration_sec}
                onPlay={() => props.onPlay(toTrack(h))}
                subtitle={
                  <span>
                    {h.plays} {h.plays === 1 ? "play" : "plays"} · first played {shortDate(h.first_played)}
                  </span>
                }
                actions={
                  <IconButton onClick={() => props.onQueue(toTrack(h))} label="Add to queue">
                    <PlusIcon size={17} />
                  </IconButton>
                }
              />
            ))}
          </ul>
        ) : (
          <p className="px-6 py-10 text-center text-sm text-cream/50">Songs you play together will collect here.</p>
        ))}
    </div>
  );
}

