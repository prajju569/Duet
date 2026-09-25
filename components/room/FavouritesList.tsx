"use client";

import type { Favourite, Track } from "@/lib/types";
import { HeartIcon, PlusIcon } from "@/components/ui/Icons";
import { IconButton, TrackRow } from "./TrackRow";

type Props = {
  favourites: Favourite[];
  onPlay: (t: Track) => void;
  onQueue: (t: Track) => void;
  onToggleFavourite: (t: Track) => void;
};

const toTrack = (f: Favourite): Track => ({
  videoId: f.video_id,
  title: f.title,
  channel: f.channel,
  thumbnail: f.thumbnail,
  durationSec: f.duration_sec,
});

export function FavouritesList({ favourites, onPlay, onQueue, onToggleFavourite }: Props) {
  if (!favourites.length) {
    return (
      <div className="px-6 py-10 text-center text-cream/55">
        <p className="font-display text-lg italic">No favourites yet</p>
        <p className="mt-1 text-sm">Tap the ♥ on any song and it lives here — one tap to play it again.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-0.5">
      {favourites.map((f) => {
        const t = toTrack(f);
        return (
          <TrackRow
            key={f.id}
            videoId={f.video_id}
            title={f.title}
            durationSec={f.duration_sec}
            subtitle={f.channel}
            onPlay={() => onPlay(t)}
            actions={
              <>
                <IconButton onClick={() => onQueue(t)} label="Add to queue">
                  <PlusIcon size={17} />
                </IconButton>
                <IconButton onClick={() => onToggleFavourite(t)} label="Remove favourite" active>
                  <HeartIcon size={16} filled />
                </IconButton>
              </>
            }
          />
        );
      })}
    </ul>
  );
}
