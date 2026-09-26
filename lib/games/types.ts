export type GameKind = "chess" | "ludo" | "ttt" | "connect4" | "wyr" | "mlt" | "tod";

export type GameRow = {
  id: string;
  room_id: string;
  kind: GameKind;
  state: Record<string, unknown>;
  status: "active" | "done" | "ended";
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const GAMES: { kind: GameKind; name: string; emoji: string; blurb: string; type: "board" | "talk" }[] = [
  { kind: "chess", name: "Chess", emoji: "♟️", blurb: "The classic. Full rules.", type: "board" },
  { kind: "ludo", name: "Ludo", emoji: "🎲", blurb: "Race your 4 tokens home.", type: "board" },
  { kind: "ttt", name: "Tic-Tac-Toe", emoji: "❌", blurb: "30-second rounds.", type: "board" },
  { kind: "connect4", name: "Connect Four", emoji: "🔴", blurb: "Get four in a row.", type: "board" },
  { kind: "wyr", name: "Would You Rather", emoji: "💭", blurb: "Answer secretly — did you match?", type: "talk" },
  { kind: "mlt", name: "Most Likely To", emoji: "💞", blurb: "Who's more likely… you or me?", type: "talk" },
  { kind: "tod", name: "Truth or Dare", emoji: "🎯", blurb: "Cute couple edition.", type: "talk" },
];

export const gameInfo = (k: GameKind) => GAMES.find((g) => g.kind === k)!;

/** Fisher–Yates on 0..n-1 */
export function shuffled(n: number, rand = Math.random): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
