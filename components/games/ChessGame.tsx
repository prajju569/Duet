"use client";

import { useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import type { BoardProps } from "./GameSheet";

export type ChessState = {
  players: [string, string]; // [white, black]
  fen: string;
  last: { from: string; to: string } | null;
  result: 0 | 1 | "draw" | null; // 0 = white won, 1 = black won
  reason: string | null;
  score: [number, number];
};

export function newChess(players: [string, string], score: [number, number] = [0, 0]): ChessState {
  return { players, fen: new Chess().fen(), last: null, result: null, reason: null, score };
}

const GLYPH: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const FILES = "abcdefgh";

export function ChessGame({ state, meIdx, names, commit }: BoardProps<ChessState>) {
  const game = useMemo(() => new Chess(state.fen), [state.fen]);
  const [sel, setSel] = useState<Square | null>(null);
  const myColor = meIdx === 0 ? "w" : "b";
  const myTurn = state.result === null && game.turn() === myColor;
  const targets = useMemo(
    () => (sel ? new Set(game.moves({ square: sel, verbose: true }).map((m) => m.to)) : new Set<string>()),
    [game, sel],
  );
  const other = meIdx === 0 ? 1 : 0;

  const tap = (sq: Square) => {
    if (!myTurn) return;
    const piece = game.get(sq);
    if (sel && targets.has(sq)) {
      const g = new Chess(state.fen);
      const m = g.move({ from: sel, to: sq, promotion: "q" });
      setSel(null);
      let result: ChessState["result"] = null;
      let reason: string | null = null;
      if (g.isCheckmate()) {
        result = g.turn() === "w" ? 1 : 0;
        reason = "Checkmate";
      } else if (g.isStalemate()) {
        result = "draw";
        reason = "Stalemate";
      } else if (g.isInsufficientMaterial()) {
        result = "draw";
        reason = "Not enough pieces";
      } else if (g.isDraw()) {
        result = "draw";
        reason = "Draw";
      }
      const score: [number, number] = [...state.score];
      if (result === 0 || result === 1) score[result]++;
      commit({ ...state, fen: g.fen(), last: { from: m.from, to: m.to }, result, reason, score }, result !== null ? "done" : "active");
      return;
    }
    setSel(piece && piece.color === myColor ? sq : null);
  };

  // Black sees the board from their side.
  const ranks = meIdx === 0 ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = meIdx === 0 ? FILES.split("") : FILES.split("").reverse();
  const inCheck = game.inCheck();

  return (
    <div className="flex flex-col items-center">
      <div className="text-sm text-cream/60">
        ♔ You <b className="text-cream">{state.score[meIdx]}</b> – <b className="text-cream">{state.score[other]}</b> {names[other]}
      </div>
      <div className="mt-2 min-h-8 text-center font-display text-2xl italic">
        {state.result === null
          ? myTurn
            ? inCheck
              ? "Check! Your move"
              : "Your move"
            : `${names[other]} is thinking…`
          : state.result === "draw"
            ? `${state.reason} — draw 🤝`
            : state.result === meIdx
              ? `${state.reason} — you win! 🎉`
              : `${state.reason} — ${names[other]} wins`}
      </div>
      <div className="mt-3 grid w-[min(94vw,420px)] grid-cols-8 overflow-hidden rounded-xl ring-1 ring-white/15">
        {ranks.map((r) =>
          files.map((f) => {
            const sq = `${f}${r}` as Square;
            const p = game.get(sq);
            const dark = (FILES.indexOf(f) + r) % 2 === 1;
            const isLast = state.last && (state.last.from === sq || state.last.to === sq);
            const kingInCheck = inCheck && p?.type === "k" && p.color === game.turn();
            return (
              <button
                key={sq}
                aria-label={sq}
                onClick={() => tap(sq)}
                className={`relative flex aspect-square items-center justify-center text-[min(8.5vw,38px)] leading-none ${
                  dark ? "bg-[#7d5a4b]" : "bg-[#eadbc8]"
                } ${sel === sq ? "outline outline-3 -outline-offset-3 outline-sky-400" : ""}`}
              >
                {isLast && <span className="absolute inset-0 bg-amber-300/35" />}
                {kingInCheck && <span className="absolute inset-0 bg-rose-500/55" />}
                {p && (
                  <span className={`relative ${p.color === "w" ? "text-white [text-shadow:0_0_2px_#000,0_1px_2px_#000]" : "text-[#1a1216] [text-shadow:0_0_1px_#fff8]"}`}>
                    {GLYPH[p.type]}
                  </span>
                )}
                {targets.has(sq) && <span className={`absolute rounded-full ${p ? "inset-1 ring-4 ring-sky-400/70" : "size-[28%] bg-sky-500/60"}`} />}
              </button>
            );
          }),
        )}
      </div>
      <p className="mt-2 text-xs text-cream/45">You&apos;re {meIdx === 0 ? "White ♔" : "Black ♚"} · tap a piece, then where to move</p>
      {state.result !== null && (
        <button
          onClick={() => commit(newChess([state.players[1], state.players[0]], [state.score[1], state.score[0]]), "active")}
          className="mt-3 rounded-full bg-cream px-5 py-2 text-sm font-semibold text-ink active:scale-95"
        >
          Rematch (swap colours)
        </button>
      )}
    </div>
  );
}
