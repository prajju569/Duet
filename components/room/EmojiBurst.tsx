"use client";

import { useCallback, useRef, useState } from "react";

type Particle = { id: number; emoji: string; x: number; delay: number; drift: number; size: number; dur: number };

/** Floating-emoji bursts — fired locally and, via broadcast, on the other phone too. */
export function useEmojiBurst() {
  const [particles, setParticles] = useState<Particle[]>([]);
  const idRef = useRef(0);

  const fire = useCallback((emoji: string) => {
    const batch: Particle[] = Array.from({ length: 14 }, () => ({
      id: ++idRef.current,
      emoji,
      x: 8 + Math.random() * 84,
      delay: Math.random() * 450,
      drift: (Math.random() - 0.5) * 90,
      size: 22 + Math.random() * 22,
      dur: 2200 + Math.random() * 1200,
    }));
    setParticles((p) => [...p, ...batch]);
    const ids = new Set(batch.map((b) => b.id));
    setTimeout(() => setParticles((p) => p.filter((x) => !ids.has(x.id))), 4000);
    navigator.vibrate?.(8);
  }, []);

  const layer = (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden>
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
          {p.emoji}
        </span>
      ))}
    </div>
  );

  return { fire, layer };
}

export const BURST_EMOJIS = ["❤️", "🔥", "😂", "🥹", "✨", "🎶"];
