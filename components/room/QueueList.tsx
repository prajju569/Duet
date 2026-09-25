"use client";

import type { QueueItem } from "@/lib/types";
import { possessive } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { XIcon } from "@/components/ui/Icons";
import { IconButton, TrackRow } from "./TrackRow";

type Props = {
  queue: QueueItem[];
  nameOf: (userId: string | null | undefined) => string;
  onPlay: (id: string) => void;
  onRemove: (id: string) => void;
  onSearch: () => void;
};

export function QueueList({ queue, nameOf, onPlay, onRemove, onSearch }: Props) {
  if (!queue.length) {
    return (
      <div className="flex flex-col items-center px-6 py-10 text-center text-cream/55">
        <p className="font-display text-lg italic">The queue is empty</p>
        <p className="mt-1 text-sm">Add a few songs — whoever adds it gets the credit.</p>
        <button onClick={onSearch} className="mt-4 rounded-full bg-white/10 px-4 py-2 text-sm text-cream ring-1 ring-white/10 active:scale-95">
          Find a song
        </button>
      </div>
    );
  }
  return (
    <ul className="space-y-0.5">
      {queue.map((q) => (
        <TrackRow
          key={q.id}
          videoId={q.video_id}
          title={q.title}
          durationSec={q.duration_sec}
          onPlay={() => onPlay(q.id)}
          subtitle={
            <>
              <Avatar userId={q.added_by} name={nameOf(q.added_by)} size={15} />
              <span>{possessive(nameOf(q.added_by))} pick</span>
            </>
          }
          actions={
            <IconButton onClick={() => onRemove(q.id)} label="Remove from queue">
              <XIcon size={16} />
            </IconButton>
          }
        />
      ))}
    </ul>
  );
}
