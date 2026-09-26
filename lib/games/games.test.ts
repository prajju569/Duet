import { describe, expect, it } from "vitest";
import { c4Move, newGrid, rematchGrid, tttMove, type GridState } from "./grid";
import { HOME, move, newLudo, roll, TRACK, type LudoState } from "./ludo";
import { answer, bothAnswered, newAsk, nextQuestion } from "./party";

const P: [string, string] = ["a", "b"];

describe("tic-tac-toe", () => {
  it("detects a win and alternates turns", () => {
    let s: GridState = newGrid(P, 9);
    for (const c of [0, 3, 1, 4]) s = tttMove(s, c)!;
    expect(s.turn).toBe(0);
    s = tttMove(s, 2)!;
    expect(s.winner).toBe(0);
    expect(s.line).toEqual([0, 1, 2]);
    expect(s.score).toEqual([1, 0]);
    expect(tttMove(s, 5)).toBeNull(); // game over
    expect(rematchGrid(s).turn).toBe(1); // other player starts the rematch
  });
  it("detects a draw", () => {
    let s = newGrid(P, 9);
    for (const c of [0, 1, 2, 4, 3, 5, 7, 6, 8]) s = tttMove(s, c)!;
    expect(s.winner).toBe("draw");
  });
});

describe("connect four", () => {
  it("drops to the bottom and finds vertical + diagonal wins", () => {
    let s = newGrid(P, 42);
    s = c4Move(s, 3)!;
    expect(s.board[5 * 7 + 3]).toBe(0);
    for (const c of [4, 3, 4, 3, 4]) s = c4Move(s, c)!;
    s = c4Move(s, 3)!; // four in column 3 for player 0
    expect(s.winner).toBe(0);
    let d = newGrid(P, 42);
    for (const c of [0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]) d = c4Move(d, c)!;
    expect(d.winner).toBe(0);
    expect(d.line?.length).toBe(4);
  });
});

describe("ludo", () => {
  it("has a 52-square track", () => expect(new Set(TRACK.map(String)).size).toBe(52));
  it("needs a 6 to come out, and a 6 gives another turn", () => {
    let s: LudoState = newLudo(P);
    s = roll(s, 3);
    expect(s.turn).toBe(1); // no move possible → turn passes
    s = roll(s, 6);
    s = move(s, 0)!;
    expect(s.tokens[1][0]).toBe(0);
    expect(s.turn).toBe(1); // rolled a 6 → again
  });
  it("captures an opponent (off safe squares) and sends it back", () => {
    const s: LudoState = { ...newLudo(P), tokens: [[1, -1, -1, -1], [25, -1, -1, -1]], turn: 0, dice: 4 };
    // Red at progress 1 (track 1) + 4 → track 5. Yellow progress 31 → track (26+31)%52 = 5.
    const s2 = { ...s, tokens: [[1, -1, -1, -1], [31, -1, -1, -1]] as [number[], number[]] };
    const out = move(s2, 0)!;
    expect(out.tokens[1][0]).toBe(-1);
    expect(out.turn).toBe(0); // capture → another roll
  });
  it("needs an exact roll to get home, and 4 home wins", () => {
    const s: LudoState = { ...newLudo(P), tokens: [[HOME, HOME, HOME, 53], [-1, -1, -1, -1]], turn: 0 };
    expect(roll(s, 5).turn).toBe(1); // 53+5 > 56 → no move
    const won = move({ ...s, dice: 3 }, 3)!;
    expect(won.winner).toBe(0);
    expect(won.score).toEqual([1, 0]);
  });
});

describe("would you rather", () => {
  it("reveals only when both answered and counts matches", () => {
    let s = newAsk(P, 10);
    s = answer(s, "a", 1);
    expect(bothAnswered(s)).toBe(false);
    s = answer(s, "b", 1);
    expect(bothAnswered(s)).toBe(true);
    expect(s.matches).toBe(1);
    s = nextQuestion(s);
    expect(s.answers).toEqual({});
    expect(s.i).toBe(1);
  });
});
