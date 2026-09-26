"use client";

import { useCallback, useRef, useState } from "react";

type Particle = { id: number; emoji: string; x: number; delay: number; drift: number; size: number; dur: number; dance: boolean };

const DANCERS = new Set(["💃", "🕺"]);

/** Floating-emoji bursts — fired locally and, via broadcast, on the other phone too. */
export function useEmojiBurst() {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [dancer, setDancer] = useState<{ id: number; emoji: string } | null>(null);
  const idRef = useRef(0);

  const fire = useCallback((emoji: string) => {
    const dance = DANCERS.has(emoji);
    const batch: Particle[] = Array.from({ length: dance ? 18 : 14 }, (_, i) => ({
      id: ++idRef.current,
      // A dance party mixes both dancers with a few music notes.
      emoji: dance ? (i % 5 === 4 ? "🎶" : i % 2 ? "💃" : "🕺") : emoji,
      x: 8 + Math.random() * 84,
      delay: Math.random() * (dance ? 900 : 450),
      drift: (Math.random() - 0.5) * 90,
      size: 22 + Math.random() * 22,
      dur: (dance ? 3000 : 2200) + Math.random() * 1200,
      dance,
    }));
    setParticles((p) => [...p, ...batch]);
    const ids = new Set(batch.map((b) => b.id));
    setTimeout(() => setParticles((p) => p.filter((x) => !ids.has(x.id))), 5000);
    if (dance) {
      // One big dancer grooves in the middle of the screen for a few seconds.
      const id = ++idRef.current;
      setDancer({ id, emoji });
      setTimeout(() => setDancer((d) => (d?.id === id ? null : d)), 3600);
      navigator.vibrate?.([10, 60, 10, 60, 10]);
    } else navigator.vibrate?.(8);
  }, []);

  const layer = (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden>
      {dancer && (
        <div key={dancer.id} className="dance-star absolute top-[30%] left-1/2 text-[min(34vw,160px)] leading-none">
          <span className="dance-groove inline-block">{dancer.emoji}</span>
        </div>
      )}
      {particles.map((p) => (
        <span
          key={p.id}
          className="emoji-float absolute bottom-0"
          style={
            {
              left: `${p.x}%`,
              fontSize: p.size,
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.dur}ms`,
              "--drift": `${p.drift}px`,
            } as React.CSSProperties
          }
        >
          {p.dance ? (
            <span className="dance-groove inline-block" style={{ animationDelay: `${p.delay % 400}ms` }}>
              {p.emoji}
            </span>
          ) : (
            p.emoji
          )}
        </span>
      ))}
    </div>
  );

  return { fire, layer };
}

export const BURST_EMOJIS = ["❤️", "💃", "🕺", "🔥", "😂", "🥹", "✨", "🎶"];
