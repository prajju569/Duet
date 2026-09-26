"use client";

import { useEffect, useState } from "react";
import type { Favourite, Track } from "@/lib/types";
import { getSupabase } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { PlusIcon, XIcon } from "@/components/ui/Icons";
import { IconButton, TrackRow } from "./TrackRow";
import { FavouritesList } from "./FavouritesList";
import { GAMES, gameInfo, type GameKind, type GameRow } from "@/lib/games/types";

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
  /** v6: couple games */
  games?: { active: GameRow[]; start: (kind: GameKind) => void; open: (id: string) => void; turnOf: (g: GameRow) => string | null; meId: string };
};

/** Favourites (yours) · Our Songs (shared) · History (everything you've played together). */
export function LibraryPanel(props: Props) {
  const [seg, setSeg] = useState<"fav" | "ours" | "history" | "games">("fav");
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
    ...(props.games ? ([["games", "🎮 Games"]] as const) : []),
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

      {seg === "games" && props.games && <GamesList {...props.games} />}

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


/** 🎮 Games: continue a game in progress, or start a new one. */
function GamesList({ active, start, open, turnOf, meId }: NonNullable<Props["games"]>) {
  return (
    <div className="px-2">
      {active.length > 0 && (
        <>
          <div className="mb-2 px-1 text-[11px] font-semibold tracking-wide text-cream/45 uppercase">In progress</div>
          <ul className="mb-4 space-y-2">
            {active.map((g) => {
              const info = gameInfo(g.kind);
              const turn = turnOf(g);
              return (
                <li key={g.id}>
                  <button onClick={() => open(g.id)} className="flex w-full items-center gap-3 rounded-2xl bg-white/8 p-3 text-left ring-1 ring-white/10 active:scale-[0.99]">
                    <span className="text-3xl">{info.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{info.name}</span>
                      <span className={`block text-xs ${turn === meId ? "text-rose-200" : "text-cream/50"}`}>
                        {turn === meId ? "Your turn" : turn ? "Their turn" : "Tap to continue"}
                      </span>
                    </span>
                    <span className="rounded-full bg-cream px-3 py-1 text-xs font-semibold text-ink">Open</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className="mb-2 px-1 text-[11px] font-semibold tracking-wide text-cream/45 uppercase">Play together</div>
      <ul className="grid grid-cols-2 gap-2">
        {GAMES.map((g) => (
          <li key={g.kind}>
            <button
              onClick={() => start(g.kind)}
              aria-label={`Start ${g.name}`}
              className="flex h-full w-full flex-col items-start gap-1 rounded-2xl bg-white/6 p-3.5 text-left ring-1 ring-white/10 transition active:scale-[0.97]"
            >
              <span className="text-3xl">{g.emoji}</span>
              <span className="font-semibold">{g.name}</span>
              <span className="text-xs leading-snug text-cream/55">{g.blurb}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 px-1 text-center text-xs text-cream/40">Starting a game invites them in the chat 💬</p>
    </div>
  );
}
