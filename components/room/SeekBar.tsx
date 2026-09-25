"use client";

import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/format";

type Props = {
  getPosition: () => number;
  duration: number | null;
  isPlaying: boolean;
  disabled?: boolean;
  onSeek: (sec: number) => void;
};

export function SeekBar({ getPosition, duration, isPlaying, disabled, onSeek }: Props) {
  const [pos, setPos] = useState(0);
  const [drag, setDragState] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  const setDrag = (v: number | null) => {
    dragRef.current = v;
    setDragState(v);
  };

  useEffect(() => {
    setPos(getPosition());
    if (!isPlaying) return;
    const t = setInterval(() => setPos(getPosition()), 250);
    return () => clearInterval(t);
  }, [getPosition, isPlaying, duration]);

  const max = duration && duration > 0 ? duration : Math.max(pos + 1, 1);
  const value = drag ?? Math.min(pos, max);
  const pct = (value / max) * 100;

  const commit = () => {
    const target = dragRef.current;
    if (target == null) return; // pointerup + touchend can both fire
    setDrag(null);
    setPos(target);
    onSeek(target);
  };

  return (
    <div>
      <input
        type="range"
        min={0}
        max={max}
        step={0.5}
        value={value}
        disabled={disabled}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onTouchEnd={commit}
        aria-label="Seek"
        className="duet-range w-full"
        style={{ "--pct": `${pct}%` } as React.CSSProperties}
      />
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-cream/50">
        <span>{formatTime(value)}</span>
        <span>{duration ? formatTime(duration) : "--:--"}</span>
      </div>
    </div>
  );
}
