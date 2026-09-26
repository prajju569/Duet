"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { gameInfo, type GameKind, type GameRow } from "@/lib/games/types";
import { newGrid, type GridState } from "@/lib/games/grid";
import { newLudo, type LudoState } from "@/lib/games/ludo";
import { MLT, newAsk, newTod, WYR, type AskState, type TodState } from "@/lib/games/party";
import { useBackToClose } from "@/lib/backStack";
import { ChessGame, newChess, type ChessState } from "./ChessGame";
import { ConnectFour, TicTacToe } from "./GridGames";
import { LudoGame } from "./LudoGame";
import { MostLikelyTo, TruthOrDare, WouldYouRather } from "./PartyGames";

export type BoardProps<S> = {
  state: S;
  meId: string;
  meIdx: 0 | 1;
  names: [string, string]; // names[i] = players[i], "You" not substituted
  commit: (next: S, status?: GameRow["status"]) => void;
};

/** Starting position for a new game. players[0] = whoever started it. */
export function newGameState(kind: GameKind, players: [string, string]): Record<string, unknown> {
  switch (kind) {
    case "chess":
      return newChess(players);
    case "ludo":
      return newLudo(players);
    case "ttt":
      return newGrid(players, 9);
    case "connect4":
      return newGrid(players, 42);
    case "wyr":
      return newAsk(players, WYR.length);
    case "mlt":
      return newAsk(players, MLT.length);
    case "tod":
      return newTod(players);
  }
}

/** Whose turn is it? (null = both / nobody) — for the "your turn" banner. */
export function turnOf(g: GameRow): string | null {
  const s = g.state as { players: [string, string]; turn?: number; fen?: string; winner?: unknown; result?: unknown; answers?: Record<string, unknown> };
  if (g.status !== "active") return null;
  if (g.kind === "chess") return s.result == null ? s.players[s.fen?.split(" ")[1] === "w" ? 0 : 1] : null;
  if (g.kind === "wyr" || g.kind === "mlt") return null;
  if (s.winner != null) return null;
  return typeof s.turn === "number" ? s.players[s.turn] : null;
}

export function GameSheet({
  gameId,
  meId,
  nameOf,
  onClose,
  onError,
  onMoved,
  chat,
}: {
  gameId: string;
  meId: string;
  nameOf: (id: string | null | undefined) => string;
  onClose: () => void;
  onError: (msg: string) => void;
  /** A move was saved — lets the room buzz the other player. */
  onMoved?: (gameId: string) => void;
  /** The room chat, docked under the board. */
  chat?: React.ReactNode;
}) {
  const supabase = getSupabase();
  const [game, setGame] = useState<GameRow | null>(null);
  const versionRef = useRef(0);
  useBackToClose(true, onClose);

  const load = useCallback(async () => {
    const { data } = await supabase.from("games").select("*").eq("id", gameId).maybeSingle();
    if (data) {
      versionRef.current = (data as GameRow).version;
      setGame(data as GameRow);
    }
  }, [supabase, gameId]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`game:${gameId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` }, ({ new: row }) => {
        const g = row as GameRow;
        if (g.version >= versionRef.current) {
          versionRef.current = g.version;
          setGame(g);
        }
      })
      .subscribe((status) => status === "SUBSCRIBED" && void load());
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, gameId, load]);

  const commit = useCallback(
    async (next: Record<string, unknown>, status: GameRow["status"] = "active") => {
      if (!game) return;
      const expected = versionRef.current;
      setGame({ ...game, state: next, status, version: expected + 1 }); // show it right away
      versionRef.current = expected + 1;
      const { data, error } = await supabase.rpc("game_move", { p_game: game.id, p_version: expected, p_state: next, p_status: status });
      if (error) {
        onError(error.message.includes("STALE") ? "They moved at the same time — here's the latest board" : "Couldn't save that move");
        await load();
        return;
      }
      const g = data as GameRow;
      onMoved?.(g.id);
      if (g.version >= versionRef.current) {
        versionRef.current = g.version;
        setGame(g);
      }
    },
    [game, supabase, load, onError, onMoved],
  );

  const info = game ? gameInfo(game.kind) : null;
  const players = (game?.state as { players?: [string, string] } | undefined)?.players;
  const meIdx = (players?.indexOf(meId) === 1 ? 1 : 0) as 0 | 1;
  const names = (players ? [nameOf(players[0]), nameOf(players[1])] : ["", ""]) as [string, string];
  const props = { meId, meIdx, names, commit: commit as BoardProps<unknown>["commit"] };

  return (
    <div className="vv-fixed z-[56] flex flex-col bg-ink/97 backdrop-blur-xl">
      <div className="flex items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),10px)] pb-2">
        <button onClick={onClose} aria-label="Close game" className="rounded-full p-2.5 text-cream/75 active:bg-white/10">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <div className="min-w-0 flex-1 text-center font-display text-xl italic">
          {info ? `${info.emoji} ${info.name}` : "Loading…"}
        </div>
        {game && game.status !== "ended" ? (
          <button
            onClick={() => {
              if (confirm("End this game for both of you?")) void commit(game.state, "ended").then(onClose);
            }}
            className="rounded-full px-3 py-2 text-sm text-cream/55 active:bg-white/10"
          >
            End
          </button>
        ) : (
          <span className="w-12" />
        )}
      </div>
      <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-2 ${chat ? "pb-4" : "pb-[max(env(safe-area-inset-bottom),20px)]"}`}>
        {!game ? (
          <p className="mt-20 text-center text-cream/50">Loading the game…</p>
        ) : game.status === "ended" ? (
          <p className="mt-20 text-center text-cream/60">This game was ended. Start a new one from Library → 🎮 Games.</p>
        ) : (
          <div className="flex justify-center">
            {game.kind === "chess" && <ChessGame state={game.state as unknown as ChessState} {...props} />}
            {game.kind === "ludo" && <LudoGame state={game.state as unknown as LudoState} {...props} />}
            {game.kind === "ttt" && <TicTacToe state={game.state as unknown as GridState} {...props} />}
            {game.kind === "connect4" && <ConnectFour state={game.state as unknown as GridState} {...props} />}
            {game.kind === "wyr" && <WouldYouRather state={game.state as unknown as AskState} {...props} />}
            {game.kind === "mlt" && <MostLikelyTo state={game.state as unknown as AskState} {...props} />}
            {game.kind === "tod" && <TruthOrDare state={game.state as unknown as TodState} {...props} />}
          </div>
        )}
      </div>
      {chat}
    </div>
  );
}
