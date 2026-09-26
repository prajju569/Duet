"use client";

import { C4_COLS, c4Move, rematchGrid, tttMove, type GridState } from "@/lib/games/grid";
import type { BoardProps } from "./GameSheet";

const MARK = ["❌", "⭕"];
const DISC = ["bg-rose-400", "bg-amber-300"];

export function TicTacToe({ state, meIdx, names, commit }: BoardProps<GridState>) {
  const myTurn = state.winner === null && state.turn === meIdx;
  return (
    <div className="flex flex-col items-center">
      <Status state={state} meIdx={meIdx} names={names} labels={MARK} commit={commit} />
      <div className="mt-4 grid w-[min(84vw,340px)] grid-cols-3 gap-2">
        {state.board.map((c, i) => (
          <button
            key={i}
            aria-label={`Cell ${i + 1}`}
            disabled={!myTurn || c !== null}
            onClick={() => {
              const next = tttMove(state, i);
              if (next) commit(next, next.winner !== null ? "done" : "active");
            }}
            className={`flex aspect-square items-center justify-center rounded-2xl text-5xl ring-1 transition active:scale-95 ${
              state.line?.includes(i) ? "bg-rose-300/25 ring-rose-200/60" : "bg-white/6 ring-white/10"
            }`}
          >
            {c !== null && <span className="animate-pop">{MARK[c]}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ConnectFour({ state, meIdx, names, commit }: BoardProps<GridState>) {
  const myTurn = state.winner === null && state.turn === meIdx;
  return (
    <div className="flex flex-col items-center">
      <Status state={state} meIdx={meIdx} names={names} labels={["🔴", "🟡"]} commit={commit} />
      <div className="mt-4 grid w-[min(92vw,380px)] grid-cols-7 gap-1.5 rounded-2xl bg-indigo-900/60 p-2 ring-1 ring-white/10">
        {state.board.map((c, i) => (
          <button
            key={i}
            aria-label={`Column ${(i % C4_COLS) + 1}`}
            disabled={!myTurn}
            onClick={() => {
              const next = c4Move(state, i % C4_COLS);
              if (next) commit(next, next.winner !== null ? "done" : "active");
            }}
            className="flex aspect-square items-center justify-center rounded-full bg-ink/80"
          >
            {c !== null && <span className={`animate-pop size-[86%] rounded-full ${DISC[c]} ${state.line?.includes(i) ? "ring-4 ring-white/80" : ""}`} />}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-cream/45">Tap a column to drop your disc</p>
    </div>
  );
}

function Status({
  state,
  meIdx,
  names,
  labels,
  commit,
}: {
  state: GridState;
  meIdx: number;
  names: [string, string];
  labels: string[];
  commit: BoardProps<GridState>["commit"];
}) {
  const other = meIdx === 0 ? 1 : 0;
  return (
    <div className="text-center">
      <div className="text-sm text-cream/60">
        {labels[meIdx]} You <b className="text-cream">{state.score[meIdx]}</b> – <b className="text-cream">{state.score[other]}</b> {names[other]} {labels[other]}
      </div>
      <div className="mt-2 min-h-8 font-display text-2xl italic">
        {state.winner === null
          ? state.turn === meIdx
            ? "Your turn"
            : `${names[other]}'s turn…`
          : state.winner === "draw"
            ? "It's a draw 🤝"
            : state.winner === meIdx
              ? "You win! 🎉"
              : `${names[other]} wins!`}
      </div>
      {state.winner !== null && (
        <button onClick={() => commit(rematchGrid(state), "active")} className="mt-2 rounded-full bg-cream px-5 py-2 text-sm font-semibold text-ink active:scale-95">
          Rematch
        </button>
      )}
    </div>
  );
}
