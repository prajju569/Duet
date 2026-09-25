import { describe, expect, it } from "vitest";
import { cleanTitle, currentLine, parseLrc, sortQueue } from "./lyrics";

describe("cleanTitle", () => {
  it("strips Bollywood-style YouTube noise", () => {
    expect(cleanTitle("Kesariya - Full Song | Brahmāstra | Ranbir Kapoor | Arijit Singh", "Sony Music India")).toEqual({ track: "Kesariya", artist: "Sony Music India" });
    expect(cleanTitle("Tum Hi Ho (Official Video) [4K]", "T-Series").track).toBe("Tum Hi Ho");
    expect(cleanTitle("Arijit Singh - Raataan Lambiyan (Lyrics)", "Arijit Singh")).toEqual({ track: "Raataan Lambiyan", artist: "Arijit Singh" });
    expect(cleanTitle("Perfect", "Ed Sheeran - Topic")).toEqual({ track: "Perfect", artist: "Ed Sheeran" });
  });
});

describe("parseLrc / currentLine", () => {
  const lines = parseLrc("[ar:x]\n[00:05.20]first\n[00:10.00]second\n[00:15.5]third\n[00:20.00][00:40.00]chorus");
  it("parses timestamps, including repeated lines", () => {
    expect(lines.map((l) => l.text)).toEqual(["first", "second", "third", "chorus", "chorus"]);
    expect(lines[0].t).toBeCloseTo(5.2);
    expect(lines[2].t).toBeCloseTo(15.5);
  });
  it("finds the line being sung", () => {
    expect(currentLine(lines, 2)).toBe(-1);
    expect(currentLine(lines, 5.3)).toBe(0);
    expect(currentLine(lines, 12)).toBe(1);
    expect(currentLine(lines, 99)).toBe(4);
  });
});

describe("sortQueue", () => {
  it("orders by position, falling back to time added", () => {
    const q = sortQueue([
      { id: "a", position: 2, created_at: "2026-09-25T10:00:00Z" },
      { id: "b", position: 1, created_at: "2026-09-25T11:00:00Z" },
      { id: "c", position: null, created_at: "2026-09-25T09:00:00Z" },
    ]);
    expect(q.map((x) => x.id)).toEqual(["b", "a", "c"]);
  });
});
