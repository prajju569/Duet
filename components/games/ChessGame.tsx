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

// Always the solid glyphs (tinted per side) + U+FE0E so phones never swap in the black ♟ emoji.
const GLYPH: Record<string, string> = { k: "♚︎", q: "♛︎", r: "♜︎", b: "♝︎", n: "♞︎", p: "♟︎" };
const PIECE_FONT = '"Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols 2", "DejaVu Sans", "Arial Unicode MS", serif';
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START_COUNT: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const FILES = "abcdefgh";

function Piece({ type, color, className = "" }: { type: string; color: "w" | "b"; className?: string }) {
  return (
    <span
      className={`inline-block leading-none select-none ${
        color === "w"
          ? "text-[#fffaf2] [-webkit-text-stroke:1.2px_#3a2a22] [text-shadow:0_2px_3px_rgb(0_0_0/0.35)]"
          : "text-[#241a1f] [-webkit-text-stroke:0.6px_#00000080] [text-shadow:0_1px_0_rgb(255_255_255/0.25),0_2px_3px_rgb(0_0_0/0.3)]"
      } ${className}`}
      style={{ fontFamily: PIECE_FONT, fontVariantEmoji: "text" } as React.CSSProperties}
    >
      {GLYPH[type]}
    </span>
  );
}

/** Pieces each side has taken, and who's ahead on material. */
function captured(game: Chess) {
  const left = { w: { ...START_COUNT }, b: { ...START_COUNT } } as Record<"w" | "b", Record<string, number>>;
  for (const row of game.board()) for (const sq of row) if (sq && sq.type !== "k") left[sq.color][sq.type]--;
  const took = (c: "w" | "b") => // pieces of colour c that are gone, i.e. taken by the other side
    (["q", "r", "b", "n", "p"] as const).flatMap((t) => Array(Math.max(0, left[c][t])).fill(t) as string[]);
  const value = (c: "w" | "b") => took(c).reduce((a, t) => a + VALUE[t], 0);
  return { byWhite: took("b"), byBlack: took("w"), lead: value("b") - value("w") }; // lead > 0 → white ahead
}

export function ChessGame({ state, meIdx, names, commit }: BoardProps<ChessState>) {
  const game = useMemo(() => new Chess(state.fen), [state.fen]);
  const [sel, setSel] = useState<Square | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);
  const myColor = meIdx === 0 ? "w" : "b";
  const theirColor = myColor === "w" ? "b" : "w";
  const myTurn = state.result === null && game.turn() === myColor;
  const targets = useMemo(
    () => (sel ? new Set(game.moves({ square: sel, verbose: true }).map((m) => m.to)) : new Set<string>()),
    [game, sel],
  );
  const other = meIdx === 0 ? 1 : 0;
  const cap = useMemo(() => captured(game), [game]);

  const play = (from: Square, to: Square, promotion: string) => {
    const g = new Chess(state.fen);
    const m = g.move({ from, to, promotion });
    setSel(null);
    setPromo(null);
    navigator.vibrate?.(m.captured ? [12, 40, 12] : 10);
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
  };

  const tap = (sq: Square) => {
    if (!myTurn) return;
    const piece = game.get(sq);
    if (sel && targets.has(sq)) {
      const isPromo = game.get(sel)?.type === "p" && (sq[1] === "8" || sq[1] === "1");
      if (isPromo) return setPromo({ from: sel, to: sq });
      return play(sel, sq, "q");
    }
    setSel(piece && piece.color === myColor && sq !== sel ? sq : null);
  };

  // Black sees the board from their side.
  const ranks = meIdx === 0 ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = meIdx === 0 ? FILES.split("") : FILES.split("").reverse();
  const inCheck = game.inCheck();
  const lead = myColor === "w" ? cap.lead : -cap.lead;

  const bar = (who: "me" | "them") => {
    const color = who === "me" ? myColor : theirColor;
    const turn = state.result === null && game.turn() === color;
    const took = color === "w" ? cap.byWhite : cap.byBlack;
    const ahead = who === "me" ? lead : -lead;
    return (
      <div className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 transition ${turn ? "bg-white/10 ring-1 ring-rose-200/40" : ""}`}>
        <span className={`flex size-7 items-center justify-center rounded-lg text-xl ${color === "w" ? "bg-[#eadbc8]" : "bg-[#5b4038]"}`}>
          <Piece type="k" color={color} />
        </span>
        <span className="text-sm font-semibold">{who === "me" ? "You" : names[other]}</span>
        <b className="text-sm text-cream/60">{state.score[who === "me" ? meIdx : other]}</b>
        {turn && <span className="size-2 animate-pulse rounded-full bg-emerald-400" aria-label="to move" />}
        <span className="ml-auto flex min-w-0 items-center overflow-hidden text-base">
          {took.map((t, i) => (
            <Piece key={i} type={t} color={color === "w" ? "b" : "w"} className="-mr-1 text-[15px]" />
          ))}
          {ahead > 0 && <span className="ml-1.5 text-xs text-cream/60">+{ahead}</span>}
        </span>
      </div>
    );
  };

  return (
    <div className="flex w-[min(94vw,440px,52dvh)] min-w-[280px] flex-col items-center">
      <div className="min-h-8 text-center font-display text-2xl italic">
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
      <div className="mt-1 w-full">{bar("them")}</div>
      <div className="relative my-1.5 grid w-full grid-cols-8 overflow-hidden rounded-lg shadow-2xl ring-2 ring-[#3a2a22]">
        {ranks.map((r, ri) =>
          files.map((f, fi) => {
            const sq = `${f}${r}` as Square;
            const p = game.get(sq);
            const dark = (FILES.indexOf(f) + r) % 2 === 1; // a1 is dark
            const isLast = state.last && (state.last.from === sq || state.last.to === sq);
            const kingInCheck = inCheck && p?.type === "k" && p.color === game.turn();
            const mine = p?.color === myColor && myTurn;
            return (
              <button
                key={sq}
                aria-label={sq}
                data-piece={p ? `${p.color}${p.type}` : undefined}
                onClick={() => tap(sq)}
                className={`relative flex aspect-square items-center justify-center text-[min(9vw,5.6dvh,42px)] ${
                  dark ? "bg-[#b58863]" : "bg-[#f0d9b5]"
                } ${mine ? "cursor-pointer" : ""}`}
              >
                {isLast && <span className="absolute inset-0 bg-[#cdd26a]/70" />}
                {sel === sq && <span className="absolute inset-0 bg-[#829769]/85" />}
                {kingInCheck && <span className="absolute inset-0 bg-[radial-gradient(circle,#ff3b3b_0%,#e0000080_45%,transparent_75%)]" />}
                {fi === 0 && <span className={`absolute top-0.5 left-0.5 text-[9px] font-bold ${dark ? "text-[#f0d9b5]" : "text-[#b58863]"}`}>{r}</span>}
                {ri === 7 && <span className={`absolute right-0.5 bottom-0 text-[9px] font-bold ${dark ? "text-[#f0d9b5]" : "text-[#b58863]"}`}>{f}</span>}
                {p && <Piece type={p.type} color={p.color} className={`relative ${sel === sq ? "scale-110" : ""} transition-transform`} />}
                {targets.has(sq) &&
                  (p ? (
                    <span className="absolute inset-0 rounded-full ring-[5px] ring-black/25 ring-inset" />
                  ) : (
                    <span className="absolute size-[30%] rounded-full bg-black/25" />
                  ))}
              </button>
            );
          }),
        )}
        {promo && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/55" onClick={() => setPromo(null)}>
            <div className="animate-pop flex gap-1.5 rounded-2xl bg-[#f0d9b5] p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              {(["q", "r", "b", "n"] as const).map((t) => (
                <button
                  key={t}
                  aria-label={`Promote to ${t}`}
                  onClick={() => play(promo.from, promo.to, t)}
                  className="flex size-14 items-center justify-center rounded-xl bg-[#b58863]/40 text-4xl active:scale-90"
                >
                  <Piece type={t} color={myColor} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="w-full">{bar("me")}</div>
      <p className="mt-1.5 text-xs text-cream/45">You&apos;re {meIdx === 0 ? "White" : "Black"} · tap a piece, then a dot</p>
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
