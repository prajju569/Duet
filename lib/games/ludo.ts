/**
 * 2-player Ludo (Red vs Yellow), classic Indian rules:
 * a 6 brings a token out and gives another roll; landing on an opponent (off the
 * safe ⭐ squares) sends it home and gives another roll; exact roll to reach home;
 * three 6s in a row forfeits the turn. First to bring all 4 tokens home wins.
 *
 * Token progress: -1 = in base, 0..50 = on the track (0 = own start square),
 * 51..55 = own home column, 56 = home.
 */
export type LudoState = {
  players: [string, string]; // [red, yellow]
  tokens: [number[], number[]];
  turn: 0 | 1;
  dice: number | null; // rolled and waiting for a move
  sixes: number;
  winner: 0 | 1 | null;
  last: string | null; // what just happened ("Red captured Yellow!")
  score: [number, number];
  starter: 0 | 1;
};

/** The 52 track squares, clockwise from Red's start, as [row, col] on a 15×15 board. */
export const TRACK: [number, number][] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0], [6, 0],
];
export const START = [0, 26]; // Red, Yellow start squares on TRACK
export const HOME_COL: [number, number][][] = [
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
];
export const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]); // starts + stars
export const HOME = 56;

export function newLudo(players: [string, string], starter: 0 | 1 = 0, score: [number, number] = [0, 0]): LudoState {
  return { players, tokens: [[-1, -1, -1, -1], [-1, -1, -1, -1]], turn: starter, dice: null, sixes: 0, winner: null, last: null, score, starter };
}

/** Track index (0..51) of a token, or null if it's in base / home column / home. */
export function trackIndex(player: 0 | 1, progress: number): number | null {
  if (progress < 0 || progress > 50) return null;
  return (START[player] + progress) % 52;
}

/** Board cell of a token (null = in base). */
export function cellOf(player: 0 | 1, progress: number): [number, number] | "home" | null {
  if (progress < 0) return null;
  if (progress >= HOME) return "home";
  if (progress > 50) return HOME_COL[player][progress - 51];
  return TRACK[trackIndex(player, progress)!];
}

export function canMove(s: LudoState, token: number): boolean {
  if (s.dice === null || s.winner !== null) return false;
  const p = s.tokens[s.turn][token];
  if (p === -1) return s.dice === 6;
  if (p >= HOME) return false;
  return p + s.dice <= HOME;
}

export function movable(s: LudoState): number[] {
  return [0, 1, 2, 3].filter((t) => canMove(s, t));
}

const NAMES = ["Red", "Yellow"];

/** Roll the dice (the random number comes from the caller). */
export function roll(s: LudoState, value: number): LudoState {
  if (s.dice !== null || s.winner !== null) return s;
  const sixes = value === 6 ? s.sixes + 1 : 0;
  if (sixes === 3) return { ...s, dice: null, sixes: 0, turn: other(s.turn), last: `${NAMES[s.turn]} rolled three 6s — turn lost` };
  const next = { ...s, dice: value, sixes, last: null };
  // Nothing can move → the turn passes.
  if (!movable(next).length) return { ...next, dice: null, sixes: 0, turn: value === 6 ? s.turn : other(s.turn), last: `${NAMES[s.turn]} rolled ${value} — no move` };
  return next;
}

export function move(s: LudoState, token: number): LudoState | null {
  if (!canMove(s, token)) return null;
  const me = s.turn;
  const them = other(me);
  const dice = s.dice!;
  const tokens: [number[], number[]] = [[...s.tokens[0]], [...s.tokens[1]]];
  const from = tokens[me][token];
  const to = from === -1 ? 0 : from + dice;
  tokens[me][token] = to;

  let last: string | null = null;
  let bonus = dice === 6;
  // Capture: an opponent token on the same track square (not a safe square) goes home.
  const at = trackIndex(me, to);
  if (at !== null && !SAFE.has(at)) {
    for (let t = 0; t < 4; t++) {
      if (trackIndex(them, tokens[them][t]) === at) {
        tokens[them][t] = -1;
        last = `${NAMES[me]} captured ${NAMES[them]}! 💥`;
        bonus = true;
      }
    }
  }
  if (to === HOME) {
    last = `${NAMES[me]} token reached home 🏠`;
    bonus = true;
  }
  const won = tokens[me].every((p) => p === HOME);
  const score: [number, number] = [...s.score];
  if (won) score[me]++;
  return {
    ...s,
    tokens,
    dice: null,
    sixes: bonus && dice === 6 ? s.sixes : 0,
    turn: won ? me : bonus ? me : them,
    winner: won ? me : null,
    last: won ? `${NAMES[me]} wins! 🎉` : last,
    score,
  };
}

export function rematchLudo(s: LudoState): LudoState {
  return newLudo(s.players, s.starter === 0 ? 1 : 0, s.score);
}

const other = (p: 0 | 1): 0 | 1 => (p === 0 ? 1 : 0);
