"use client";

import { useRef } from "react";

/** Box-per-digit PIN entry backed by one real input (so paste, autofill and the numeric keypad just work). */
export function PinInput({
  value,
  onChange,
  onComplete,
  autoFocus,
  label = "PIN",
  hidden = true,
  length = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  autoFocus?: boolean;
  label?: string;
  hidden?: boolean;
  length?: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        aria-label={label}
        inputMode="numeric"
        pattern="\d*"
        autoComplete="one-time-code"
        maxLength={length}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, length);
          onChange(v);
          if (v.length === length) onComplete?.(v);
        }}
        className="absolute inset-0 h-full w-full cursor-pointer text-base opacity-0"
      />
      <div className="pointer-events-none mx-auto grid max-w-64 gap-3" style={{ gridTemplateColumns: `repeat(${length}, 1fr)` }} aria-hidden>
        {Array.from({ length }, (_, i) => {
          const filled = i < value.length;
          const active = i === Math.min(value.length, length - 1);
          return (
            <div
              key={i}
              className={`flex h-16 items-center justify-center rounded-2xl bg-white/8 text-2xl font-semibold ring-1 transition ${
                active ? "ring-cream/60" : "ring-white/10"
              }`}
            >
              {filled ? (hidden ? <span className="size-3 rounded-full bg-cream" /> : value[i]) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
