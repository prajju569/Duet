"use client";

import { useEffect, useRef, useState } from "react";
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
  /** v2: drag to reorder + autoplay switch */
  onReorder?: (ids: string[]) => void;
  autoplay?: boolean;
  onAutoplay?: (on: boolean) => void;
};

export function QueueList({ queue, nameOf, onPlay, onRemove, onSearch, onReorder, autoplay, onAutoplay }: Props) {
  const [order, setOrder] = useState(queue);
  const [dragId, setDragId] = useState<string | null>(null);
  const drag = useRef<{ id: string; startY: number; rowH: number; startIndex: number } | null>(null);

  // Follow the server unless we're mid-drag.
  useEffect(() => {
    if (!drag.current) setOrder(queue);
  }, [queue]);

  const autoplayRow = onAutoplay && (
    <label className="mx-2 mb-2 flex cursor-pointer items-center justify-between rounded-2xl bg-white/5 px-4 py-2.5 text-[13px] ring-1 ring-white/5">
      <span>
        <b className="font-semibold">Autoplay</b>
        <span className="text-cream/50"> — when the queue ends, play songs you both love</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-label="Autoplay"
        checked={!!autoplay}
        onChange={(e) => onAutoplay(e.target.checked)}
        className="peer sr-only"
      />
      <span className="relative ml-3 h-6 w-10 shrink-0 rounded-full bg-white/15 transition peer-checked:bg-rose-300 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-cream after:transition peer-checked:after:translate-x-4" />
    </label>
  );

  if (!order.length) {
    return (
      <div>
        {autoplayRow}
        <div className="flex flex-col items-center px-6 py-10 text-center text-cream/55">
          <p className="font-display text-lg italic">The queue is empty</p>
          <p className="mt-1 text-sm">Add a few songs — whoever adds it gets the credit.</p>
          <button onClick={onSearch} className="mt-4 rounded-full bg-white/10 px-4 py-2 text-sm text-cream ring-1 ring-white/10 active:scale-95">
            Find a song
          </button>
        </div>
      </div>
    );
  }

  const onPointerDown = (e: React.PointerEvent, id: string) => {
    if (!onReorder) return;
    e.preventDefault();
    const row = (e.currentTarget as HTMLElement).closest("li");
    drag.current = { id, startY: e.clientY, rowH: row?.offsetHeight || 64, startIndex: order.findIndex((q) => q.id === id) };
    setDragId(id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const target = Math.max(0, Math.min(order.length - 1, d.startIndex + Math.round((e.clientY - d.startY) / d.rowH)));
    const from = order.findIndex((q) => q.id === d.id);
    if (target !== from) {
      const next = [...order];
      const [item] = next.splice(from, 1);
      next.splice(target, 0, item);
      setOrder(next);
      navigator.vibrate?.(5);
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragId(null);
    if (!d) return;
    const ids = order.map((q) => q.id);
    if (ids.join() !== queue.map((q) => q.id).join()) onReorder?.(ids);
  };

  return (
    <div>
      {autoplayRow}
      <ul className="space-y-0.5">
        {order.map((q) => (
          <div key={q.id} className={dragId === q.id ? "relative z-10 scale-[1.02] rounded-2xl bg-white/10 shadow-xl transition-transform" : ""}>
            <TrackRow
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
                <>
                  <IconButton onClick={() => onRemove(q.id)} label="Remove from queue">
                    <XIcon size={16} />
                  </IconButton>
                  {onReorder && order.length > 1 && (
                    <button
                      aria-label={`Drag to reorder ${q.title}`}
                      onPointerDown={(e) => onPointerDown(e, q.id)}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerCancel={onPointerUp}
                      style={{ touchAction: "none" }}
                      className="cursor-grab rounded-full p-2 text-cream/45 active:cursor-grabbing"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
                        <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
                        <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
                      </svg>
                    </button>
                  )}
                </>
              }
            />
          </div>
        ))}
      </ul>
    </div>
  );
}
