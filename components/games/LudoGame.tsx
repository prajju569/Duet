"use client";

import { useState } from "react";
import { cellOf, HOME, HOME_COL, movable, move, rematchLudo, roll, SAFE, START, TRACK, type LudoState } from "@/lib/games/ludo";
import type { BoardProps } from "./GameSheet";

const COLORS = [
  { name: "Red", token: "bg-rose-500", soft: "bg-rose-500/35", ring: "ring-rose-200" },
  { name: "Yellow", token: "bg-amber-400", soft: "bg-amber-400/35", ring: "ring-amber-100" },
];
const BASE_SLOTS: [number, number][][] = [
  [[1, 1], [1, 4], [4, 1], [4, 4]],
  [[10, 10], [10, 13], [13, 10], [13, 13]],
];
const DIE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const trackAt = new Map(TRACK.map(([r, c], i) => [`${r},${c}`, i]));
const homeColAt = new Map(HOME_COL.flatMap((col, p) => col.map(([r, c]) => [`${r},${c}`, p] as const)));

function cellColor(r: number, c: number): string {
  if (r < 6 && c < 6) return "bg-rose-500/25";
  if (r < 6 && c > 8) return "bg-emerald-500/15";
  if (r > 8 && c > 8) return "bg-amber-400/25";
  if (r > 8 && c < 6) return "bg-sky-500/15";
  if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return "bg-gradient-to-br from-rose-500/40 via-cream/10 to-amber-400/40";
  // Home lanes of the two colours not playing (green top, blue bottom): drawn softly.
  if (c === 7 && r >= 1 && r <= 5) return "bg-emerald-500/20";
  if (c === 7 && r >= 9 && r <= 13) return "bg-sky-500/20";
  const hc = homeColAt.get(`${r},${c}`);
  if (hc !== undefined) return COLORS[hc].soft;
  const t = trackAt.get(`${r},${c}`);
  if (t === START[0]) return "bg-rose-500/60";
  if (t === START[1]) return "bg-amber-400/60";
  if (t !== undefined) return "bg-cream/90";
  return "bg-transparent";
}

export function LudoGame({ state, meIdx, names, commit }: BoardProps<LudoState>) {
  const [rolling, setRolling] = useState(false);
  const other = meIdx === 0 ? 1 : 0;
  const myTurn = state.winner === null && state.turn === meIdx;
  const canPick = myTurn && state.dice !== null ? new Set(movable(state)) : new Set<number>();

  // Where each token is drawn: [row, col] → tokens there
  const at = new Map<string, { p: 0 | 1; t: number }[]>();
  const home: { p: 0 | 1; t: number }[] = [];
  ([0, 1] as const).forEach((p) =>
    state.tokens[p].forEach((prog, t) => {
      const cell = cellOf(p, prog);
      if (cell === "home") return void home.push({ p, t });
      const [r, c] = cell ?? BASE_SLOTS[p][t];
      const k = `${r},${c}`;
      at.set(k, [...(at.get(k) ?? []), { p, t }]);
    }),
  );

  const doRoll = () => {
    if (!myTurn || state.dice !== null || rolling) return;
    setRolling(true);
    navigator.vibrate?.(15);
    setTimeout(() => {
      setRolling(false);
      const value = 1 + Math.floor(Math.random() * 6);
      commit(roll(state, value), "active");
    }, 450);
  };

  const pick = (t: number) => {
    const next = move(state, t);
    if (next) commit(next, next.winner !== null ? "done" : "active");
  };

  return (
    <div className="flex flex-col items-center">
      <div className="text-sm text-cream/60">
        <span className="mr-1 inline-block size-2.5 rounded-full bg-rose-500 align-middle" />
        {meIdx === 0 ? "You" : names[0]} <b className="text-cream">{state.score[0]}</b> – <b className="text-cream">{state.score[1]}</b> {meIdx === 1 ? "You" : names[1]}
        <span className="ml-1 inline-block size-2.5 rounded-full bg-amber-400 align-middle" />
      </div>
      <div className="mt-1 min-h-7 text-center font-display text-xl italic">
        {state.winner !== null
          ? state.winner === meIdx
            ? "You win! 🎉"
            : `${names[other]} wins!`
          : myTurn
            ? state.dice === null
              ? "Your turn — roll!"
              : `You rolled ${state.dice} — tap a token`
            : `${names[other]}'s turn…`}
      </div>
      {state.last && <div className="text-xs text-cream/55">{state.last}</div>}

      <div className="relative mt-2 grid w-[min(94vw,420px)] grid-cols-[repeat(15,1fr)] overflow-hidden rounded-xl bg-[#241a20] ring-1 ring-white/10">
        {Array.from({ length: 225 }, (_, i) => {
          const r = Math.floor(i / 15), c = i % 15;
          const here = at.get(`${r},${c}`) ?? [];
          const t = trackAt.get(`${r},${c}`);
          return (
            <div key={i} className={`relative flex aspect-square items-center justify-center border-[0.5px] border-black/10 ${cellColor(r, c)}`}>
              {t !== undefined && SAFE.has(t) && t !== START[0] && t !== START[1] && here.length === 0 && <span className="text-[9px] opacity-50">⭐</span>}
              {here.map(({ p, t: tok }, k) => {
                const mine = p === meIdx;
                const active = mine && canPick.has(tok);
                return (
                  <button
                    key={`${p}-${tok}`}
                    aria-label={`${COLORS[p].name} token ${tok + 1}`}
                    disabled={!active}
                    onClick={() => pick(tok)}
                    className={`absolute size-[78%] rounded-full ${COLORS[p].token} shadow ring-2 ring-white/80 ${active ? "z-10 animate-bounce ring-4" : ""}`}
                    style={here.length > 1 ? { transform: `translate(${(k % 2) * 30 - 15}%, ${Math.floor(k / 2) * 30 - 15}%) scale(0.75)` } : undefined}
                  />
                );
              })}
            </div>
          );
        })}
        {home.length > 0 && (
          <div className="pointer-events-none absolute top-[40%] left-[40%] flex size-[20%] flex-wrap items-center justify-center gap-0.5">
            {home.map(({ p, t }) => (
              <span key={`h${p}${t}`} className={`size-[30%] rounded-full ${COLORS[p].token} ring-1 ring-white`} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          onClick={doRoll}
          disabled={!myTurn || state.dice !== null || rolling}
          aria-label="Roll the dice"
          className={`flex size-20 items-center justify-center rounded-2xl bg-cream text-6xl leading-none text-ink shadow-xl transition active:scale-90 disabled:opacity-60 ${
            rolling ? "animate-spin" : ""
          }`}
        >
          {state.dice ? DIE[state.dice] : "🎲"}
        </button>
        <div className="text-sm text-cream/60">
          You&apos;re <b className={meIdx === 0 ? "text-rose-300" : "text-amber-300"}>{COLORS[meIdx].name}</b>
          <br />
          {state.tokens[meIdx].filter((p) => p === HOME).length}/4 home
        </div>
      </div>
      {state.winner !== null && (
        <button onClick={() => commit(rematchLudo(state), "active")} className="mt-3 rounded-full bg-cream px-5 py-2 text-sm font-semibold text-ink active:scale-95">
          Rematch
        </button>
      )}
    </div>
  );
}
