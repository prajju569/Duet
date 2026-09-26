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

  // iPhones only let you drag the tiny thumb of a native slider — so the whole strip
  // listens: tap anywhere to jump, or slide your finger along it.
  const barRef = useRef<HTMLDivElement>(null);
  const fromPointer = (x: number) => {
    const r = barRef.current!.getBoundingClientRect();
    return Math.round(Math.min(1, Math.max(0, (x - r.left) / r.width)) * max * 2) / 2;
  };

  return (
    <div className={disabled ? "opacity-40" : ""}>
      <div
        ref={barRef}
        className="group relative -my-2 cursor-pointer py-3"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag(fromPointer(e.clientX));
        }}
        onPointerMove={(e) => {
          if (dragRef.current != null) setDrag(fromPointer(e.clientX));
        }}
        onPointerUp={commit}
        onPointerCancel={() => setDrag(null)}
      >
        <div className={`relative w-full rounded-full bg-white/15 transition-[height] ${drag != null ? "h-2" : "h-[5px]"}`}>
          <div className="absolute inset-y-0 left-0 rounded-full bg-cream" style={{ width: `${pct}%` }} />
          <div
            className={`absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cream shadow-[0_2px_10px_rgb(0_0_0/0.4)] transition-transform ${
              drag != null ? "scale-125" : ""
            }`}
            style={{ left: `${pct}%` }}
          />
        </div>
        {/* Real slider underneath for keyboards & screen readers. */}
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
          aria-label="Seek"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-cream/50">
        <span>{formatTime(value)}</span>
        <span>{duration ? formatTime(duration) : "--:--"}</span>
      </div>
    </div>
  );
}
