/** Tic-tac-toe & Connect Four: pure rules. Players are 0 and 1. */
export type Cell = 0 | 1 | null;
export type GridState = {
  players: [string, string];
  board: Cell[];
  turn: 0 | 1;
  starter: 0 | 1;
  winner: 0 | 1 | "draw" | null;
  line: number[] | null;
  score: [number, number];
};

export function newGrid(players: [string, string], size: number, starter: 0 | 1 = 0, score: [number, number] = [0, 0]): GridState {
  return { players, board: Array(size).fill(null), turn: starter, starter, winner: null, line: null, score };
}

const TTT_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export function tttMove(s: GridState, cell: number): GridState | null {
  if (s.winner !== null || s.board[cell] !== null) return null;
  const board = [...s.board];
  board[cell] = s.turn;
  const line = TTT_LINES.find((l) => l.every((i) => board[i] === s.turn)) ?? null;
  return finish(s, board, line);
}

export const C4_COLS = 7;
export const C4_ROWS = 6;

/** Drop in a column (row 0 = top). */
export function c4Move(s: GridState, col: number): GridState | null {
  if (s.winner !== null) return null;
  let row = -1;
  for (let r = C4_ROWS - 1; r >= 0; r--) if (s.board[r * C4_COLS + col] === null) { row = r; break; }
  if (row < 0) return null;
  const board = [...s.board];
  const at = row * C4_COLS + col;
  board[at] = s.turn;
  return finish(s, board, c4Line(board, row, col, s.turn));
}

function c4Line(b: Cell[], row: number, col: number, p: 0 | 1): number[] | null {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [row * C4_COLS + col];
    for (const dir of [1, -1]) {
      let r = row + dr * dir, c = col + dc * dir;
      while (r >= 0 && r < C4_ROWS && c >= 0 && c < C4_COLS && b[r * C4_COLS + c] === p) {
        cells.push(r * C4_COLS + c);
        r += dr * dir;
        c += dc * dir;
      }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

function finish(s: GridState, board: Cell[], line: number[] | null): GridState {
  if (line) {
    const score: [number, number] = [...s.score];
    score[s.turn]++;
    return { ...s, board, line, winner: s.turn, score };
  }
  if (board.every((c) => c !== null)) return { ...s, board, winner: "draw" };
  return { ...s, board, turn: s.turn === 0 ? 1 : 0 };
}

/** Rematch: same players, score kept, the other one starts. */
export function rematchGrid(s: GridState): GridState {
  return newGrid(s.players, s.board.length, s.starter === 0 ? 1 : 0, s.score);
}
