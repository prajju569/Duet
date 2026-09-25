"use client";

import { useRef } from "react";

/** Six-box PIN entry backed by one real input (so paste, autofill and the numeric keypad just work). */
export function PinInput({
  value,
  onChange,
  onComplete,
  autoFocus,
  label = "6-digit PIN",
  hidden = true,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  autoFocus?: boolean;
  label?: string;
  hidden?: boolean;
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
        maxLength={6}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 6);
          onChange(v);
          if (v.length === 6) onComplete?.(v);
        }}
        className="absolute inset-0 h-full w-full cursor-pointer text-base opacity-0"
      />
      <div className="pointer-events-none grid grid-cols-6 gap-2" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => {
          const filled = i < value.length;
          const active = i === Math.min(value.length, 5);
          return (
            <div
              key={i}
              className={`flex h-14 items-center justify-center rounded-2xl bg-white/8 text-2xl font-semibold ring-1 transition ${
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
