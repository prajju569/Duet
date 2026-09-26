"use client";

import { useEffect, useRef, useState } from "react";
import { cellOf, HOME, HOME_COL, movable, move, rematchLudo, roll, SAFE, START, TRACK, type LudoState } from "@/lib/games/ludo";
import type { BoardProps } from "./GameSheet";

const RED = "#e5484d";
const YELLOW = "#f2b705";
const GREEN = "#30a46c";
const BLUE = "#3e8ed0";
const PLAYER = [
  { name: "Red", hex: RED, text: "text-rose-300" },
  { name: "Yellow", hex: YELLOW, text: "text-amber-300" },
];
const CELL = 100 / 15; // % of the board per cell

// Where tokens sit in their base (cell units, top-left of a cell-sized box).
const BASE_POS: [number, number][][] = [
  [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]],
  [[10.5, 10.5], [10.5, 12.5], [12.5, 10.5], [12.5, 12.5]],
];
// Finished tokens gather in their colour's triangle in the middle.
const HOME_POS: [number, number][][] = [
  [[6.7, 5.9], [7.3, 5.9], [6.7, 6.4], [7.3, 6.4]],
  [[6.7, 8.1], [7.3, 8.1], [6.7, 7.6], [7.3, 7.6]],
];
const QUADRANTS = [
  { r: 0, c: 0, hex: RED, player: 0 },
  { r: 0, c: 9, hex: GREEN, player: null },
  { r: 9, c: 9, hex: YELLOW, player: 1 },
  { r: 9, c: 0, hex: BLUE, player: null },
] as const;
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

/** Every square that's part of the path, with its colour. */
const SQUARES: { r: number; c: number; bg: string; star?: boolean }[] = [
  ...TRACK.map(([r, c], i) => ({
    r,
    c,
    bg: i === START[0] ? RED : i === START[1] ? YELLOW : i === 13 ? `${GREEN}` : i === 39 ? BLUE : "#fffdf8",
    star: SAFE.has(i) && i !== START[0] && i !== START[1] && i !== 13 && i !== 39,
  })),
  ...HOME_COL[0].map(([r, c]) => ({ r, c, bg: RED })),
  ...HOME_COL[1].map(([r, c]) => ({ r, c, bg: YELLOW })),
  ...[1, 2, 3, 4, 5].map((r) => ({ r, c: 7, bg: `${GREEN}66` })),
  ...[9, 10, 11, 12, 13].map((r) => ({ r, c: 7, bg: `${BLUE}66` })),
];

function Die({ value, rolling, color, size = 64 }: { value: number | null; rolling: boolean; color: string; size?: number }) {
  const [face, setFace] = useState(value ?? 6);
  useEffect(() => {
    if (!rolling) return;
    const t = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 70);
    return () => clearInterval(t);
  }, [rolling]);
  const shown = rolling ? face : (value ?? 0);
  return (
    <div
      className={`grid grid-cols-3 grid-rows-3 rounded-[22%] bg-white p-[14%] shadow-[0_6px_0_rgb(0_0_0/0.25),0_10px_24px_rgb(0_0_0/0.35)] ${rolling ? "ludo-roll" : ""}`}
      style={{ width: size, height: size, boxShadow: `inset 0 -4px 0 ${color}55, 0 6px 16px rgb(0 0 0 / 0.35)` }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="flex items-center justify-center">
          {PIPS[shown]?.includes(i) && <span className="size-[78%] rounded-full" style={{ background: shown === 1 ? RED : "#241a1f" }} />}
        </span>
      ))}
    </div>
  );
}

/**
 * Token positions as drawn — walks a moved token square by square instead of
 * teleporting, and sends captured tokens home after the capturer lands.
 */
function useWalkingTokens(tokens: [number[], number[]]): [number[], number[]] {
  const [shown, setShown] = useState(tokens);
  const shownRef = useRef(tokens);
  const key = JSON.stringify(tokens);
  useEffect(() => {
    const target = JSON.parse(key) as [number[], number[]];
    const walks = (cur: number, to: number) => cur >= 0 && to > cur && to - cur <= 6;
    const set = (v: [number[], number[]]) => {
      shownRef.current = v;
      setShown(v);
    };
    // Tokens that jumped (out of base, or anything unexpected) go straight there; captures wait.
    set(
      shownRef.current.map((side, p) =>
        side.map((cur, t) => {
          const to = target[p][t];
          return walks(cur, to) || (to === -1 && cur >= 0) ? cur : to;
        }),
      ) as [number[], number[]],
    );
    const timer = setInterval(() => {
      const cur = shownRef.current;
      const stepping = cur.some((side, p) => side.some((v, t) => walks(v, target[p][t])));
      if (!stepping) {
        clearInterval(timer);
        set(target);
        return;
      }
      set(cur.map((side, p) => side.map((v, t) => (walks(v, target[p][t]) ? v + 1 : v))) as [number[], number[]]);
    }, 150);
    return () => clearInterval(timer);
  }, [key]);
  return shown;
}

export function LudoGame({ state, meIdx, names, commit }: BoardProps<LudoState>) {
  const [rolling, setRolling] = useState(false);
  const [lastDice, setLastDice] = useState<number | null>(state.dice);
  const other = meIdx === 0 ? 1 : 0;
  const myTurn = state.winner === null && state.turn === meIdx;
  const canPick = myTurn && state.dice !== null && !rolling ? new Set(movable(state)) : new Set<number>();
  const shown = useWalkingTokens(state.tokens);

  useEffect(() => {
    if (state.dice !== null) setLastDice(state.dice);
  }, [state.dice]);
  useEffect(() => {
    if (state.last?.includes("captured")) navigator.vibrate?.([30, 50, 30]);
  }, [state.last]);

  const pick = (t: number) => {
    const next = move(state, t);
    if (!next) return;
    navigator.vibrate?.(10);
    commit(next, next.winner !== null ? "done" : "active");
  };

  // Only one real choice (e.g. a single token out, or all four still in base) → move it for them.
  const choices = [...canPick];
  const distinct = new Set(choices.map((t) => state.tokens[meIdx][t]));
  const autoPick = distinct.size === 1 ? choices[0] : null;
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const autoKey = `${JSON.stringify(state.tokens)}:${state.dice}:${autoPick}`;
  useEffect(() => {
    if (autoPick === null) return;
    const t = setTimeout(() => pickRef.current(autoPick), 650);
    return () => clearTimeout(t);
  }, [autoKey, autoPick]);

  const doRoll = () => {
    if (!myTurn || state.dice !== null || rolling) return;
    setRolling(true);
    navigator.vibrate?.(15);
    const value = 1 + Math.floor(Math.random() * 6);
    setTimeout(() => {
      setRolling(false);
      setLastDice(value);
      commit(roll(state, value), "active");
    }, 700);
  };

  // Draw positions for every token (with a small fan-out when they share a square).
  type Tok = { p: 0 | 1; t: number; r: number; c: number };
  const toks: Tok[] = [];
  ([0, 1] as const).forEach((p) =>
    shown[p].forEach((prog, t) => {
      const cell = cellOf(p, prog);
      const [r, c] = cell === "home" ? HOME_POS[p][t] : (cell ?? BASE_POS[p][t]);
      toks.push({ p, t, r, c });
    }),
  );
  const stacks = new Map<string, Tok[]>();
  for (const k of toks) {
    if (shown[k.p][k.t] < 0 || shown[k.p][k.t] >= HOME) continue;
    const id = `${k.r},${k.c}`;
    stacks.set(id, [...(stacks.get(id) ?? []), k]);
  }

  const status =
    state.winner !== null
      ? state.winner === meIdx
        ? "You win! 🎉"
        : `${names[other]} wins!`
      : myTurn
        ? rolling
          ? "Rolling…"
          : state.dice === null
            ? "Your turn — tap the dice"
            : choices.length > 1 && distinct.size > 1
              ? `You rolled ${state.dice} — tap a glowing token`
              : `You rolled ${state.dice}!`
        : state.dice !== null
          ? `${names[other]} rolled ${state.dice}…`
          : `${names[other]}'s turn…`;

  const panel = (p: 0 | 1) => {
    const active = state.winner === null && state.turn === p;
    const home = state.tokens[p].filter((x) => x === HOME).length;
    return (
      <div
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-2.5 py-2 ring-1 transition ${active ? "bg-white/12 ring-white/40" : "bg-white/4 ring-white/8 opacity-70"}`}
        style={active ? { boxShadow: `0 0 0 2px ${PLAYER[p].hex}88, 0 0 22px ${PLAYER[p].hex}55` } : undefined}
      >
        <span className="size-6 shrink-0 rounded-full ring-2 ring-white" style={{ background: `radial-gradient(circle at 35% 30%, #fff8 0 18%, ${PLAYER[p].hex} 20%)` }} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {p === meIdx ? "You" : names[p]} <span className="text-cream/50">{state.score[p]}</span>
          </div>
          <div className="flex gap-0.5" aria-label={`${home} of 4 home`}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="size-1.5 rounded-full" style={{ background: i < home ? PLAYER[p].hex : "#ffffff26" }} />
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex w-[min(94vw,440px,50dvh)] min-w-[280px] flex-col items-center">
      <div className="flex w-full gap-2">
        {panel(0)}
        {panel(1)}
      </div>

      <div className="relative mt-2 aspect-square w-full overflow-hidden rounded-2xl bg-[#fffdf8] shadow-2xl ring-2 ring-black/30">
        {QUADRANTS.map((q) => (
          <div
            key={q.hex}
            className="absolute p-[2.2%]"
            style={{ top: `${q.r * CELL}%`, left: `${q.c * CELL}%`, width: `${6 * CELL}%`, height: `${6 * CELL}%`, background: q.hex, opacity: q.player === null ? 0.55 : 1 }}
          >
            <div className="relative size-full rounded-[18%] bg-[#fffdf8] shadow-inner">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="absolute size-[28%] rounded-full"
                  style={{ top: `${i < 2 ? 18 : 54}%`, left: `${i % 2 ? 54 : 18}%`, background: `${q.hex}40`, boxShadow: `inset 0 0 0 2px ${q.hex}` }}
                />
              ))}
            </div>
          </div>
        ))}
        {SQUARES.map((s) => (
          <div
            key={`${s.r},${s.c}`}
            className="absolute flex items-center justify-center border-[0.5px] border-black/20"
            style={{ top: `${s.r * CELL}%`, left: `${s.c * CELL}%`, width: `${CELL}%`, height: `${CELL}%`, background: s.bg }}
          >
            {s.star && <span className="text-[min(3vw,13px)] leading-none opacity-40">★</span>}
          </div>
        ))}
        <div
          className="absolute"
          style={{
            top: `${6 * CELL}%`,
            left: `${6 * CELL}%`,
            width: `${3 * CELL}%`,
            height: `${3 * CELL}%`,
            background: `conic-gradient(from -45deg, ${GREEN} 0 90deg, ${YELLOW} 90deg 180deg, ${BLUE} 180deg 270deg, ${RED} 270deg 360deg)`,
          }}
        />

        {toks.map(({ p, t, r, c }) => {
          const stack = stacks.get(`${r},${c}`) ?? [];
          const k = stack.findIndex((x) => x.p === p && x.t === t);
          const n = stack.length;
          const active = p === meIdx && canPick.has(t);
          const done = shown[p][t] >= HOME;
          const scale = done ? 0.55 : n > 1 ? 0.72 : 1;
          const dx = n > 1 ? ((k % 2) - 0.5) * 0.42 : 0;
          const dy = n > 1 ? (Math.floor(k / 2) - (n > 2 ? 0.5 : 0)) * 0.42 : 0;
          return (
            <button
              key={`${p}-${t}`}
              aria-label={`${PLAYER[p].name} token ${t + 1}`}
              disabled={!active}
              onClick={() => pick(t)}
              className="absolute flex items-center justify-center transition-[top,left] duration-150 ease-out"
              style={{ top: `${(r + dy) * CELL}%`, left: `${(c + dx) * CELL}%`, width: `${CELL}%`, height: `${CELL}%`, zIndex: active ? 20 : 10 + k }}
            >
              {active && <span className="ludo-glow absolute inset-[-18%] rounded-full" style={{ boxShadow: `0 0 0 3px #fff, 0 0 14px 4px ${PLAYER[p].hex}` }} />}
              <span
                className={`relative block rounded-full ring-2 ring-white ${active ? "animate-bounce" : ""}`}
                style={{
                  width: `${86 * scale}%`,
                  height: `${86 * scale}%`,
                  background: `radial-gradient(circle at 35% 30%, #ffffffb0 0 16%, ${PLAYER[p].hex} 18% 62%, color-mix(in srgb, ${PLAYER[p].hex} 70%, #000) 100%)`,
                  boxShadow: "0 2px 3px rgb(0 0 0 / 0.45)",
                }}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-2 min-h-6 text-center font-display text-xl italic">{status}</div>
      {state.last && (
        <div key={state.last} className="animate-pop mt-0.5 rounded-full bg-white/8 px-3 py-1 text-xs text-cream/75">
          {state.last}
        </div>
      )}

      <button
        onClick={doRoll}
        disabled={!myTurn || state.dice !== null || rolling || state.winner !== null}
        aria-label="Roll the dice"
        className={`mt-3 rounded-3xl p-1.5 transition active:scale-90 ${myTurn && state.dice === null && !rolling && state.winner === null ? "ludo-ready" : "opacity-80"}`}
        style={{ ["--ring" as string]: PLAYER[state.turn].hex }}
      >
        <Die value={rolling ? null : (state.dice ?? lastDice)} rolling={rolling} color={PLAYER[state.turn].hex} />
      </button>
      <p className="mt-1 text-xs text-cream/45">
        You&apos;re <b className={PLAYER[meIdx].text}>{PLAYER[meIdx].name}</b> · a 6 brings a token out · ★ squares are safe
      </p>
      {state.winner !== null && (
        <button onClick={() => commit(rematchLudo(state), "active")} className="mt-3 rounded-full bg-cream px-5 py-2 text-sm font-semibold text-ink active:scale-95">
          Rematch
        </button>
      )}
    </div>
  );
}
