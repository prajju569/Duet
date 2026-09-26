import { describe, expect, it } from "vitest";
import { copy, istHour, pick, type Copy } from "./notifyCopy";

const at = (i: number) => () => i / 3 + 0.01; // picks option i of 3
const all = (f: (r: () => number) => Copy) => [0, 1, 2].map((i) => f(at(i)));

describe("notification copy", () => {
  const cases: Record<string, (r: () => number) => Copy> = {
    photo: (r) => copy.photo("Prajwal", r),
    voice: (r) => copy.voice("Prajwal", r),
    sticker: (r) => copy.sticker("Prajwal", "😂", r),
    poll: (r) => copy.poll("Prajwal", "Dinner tonight?", r),
    dedication: (r) => copy.dedication("Prajwal", "Kesariya", r),
    nudge: (r) => copy.nudge("Prajwal", r, new Date("2026-09-26T08:00:00Z")),
    lateNudge: (r) => copy.nudge("Prajwal", r, new Date("2026-09-26T19:42:00Z")), // 1:12 AM IST
    miss: (r) => copy.miss("Prajwal", r),
    listen: (r) => copy.listen("Prajwal", "Kesariya", r),
    listenNoSong: (r) => copy.listen("Prajwal", null, r),
    invite: (r) => copy.gameInvite("Prajwal", "chess", r),
    turn: (r) => copy.yourTurn("Prajwal", "ludo", r),
    won: (r) => copy.gameOver("Prajwal", "chess", "won", r),
    lost: (r) => copy.gameOver("Prajwal", "ttt", "lost", r),
    draw: (r) => copy.gameOver("Prajwal", "connect4", "draw", r),
    reaction: (r) => copy.reaction("Prajwal", "❤️", "reached home?", r),
    dance: (r) => copy.reaction("Prajwal", "💃", "reached home?", r),
    scheduled: (r) => copy.scheduled("Prajwal", "Good morning ☀️", r),
    joined: (r) => copy.joined("Ananya", r),
    quiet: (r) => copy.quiet("Prajwal", 2, r),
    countdown: (r) => copy.countdown("Goa trip", 3, r),
    countdownToday: (r) => copy.countdown("Goa trip", 0, r),
    milestone: (r) => copy.milestone("Prajwal", 30, r),
  };
  for (const [name, f] of Object.entries(cases)) {
    it(`${name}: 3 different versions, none empty`, () => {
      const v = all(f);
      expect(new Set(v.map((c) => c.title + "|" + c.body)).size).toBe(3);
      for (const c of v) {
        expect(c.title.trim().length).toBeGreaterThan(0);
        expect(c.body.trim().length).toBeGreaterThan(0);
        expect(c.title + c.body).not.toMatch(/undefined|null|\$\{/);
      }
    });
  }
  it("late-night nudge mentions the time in India", () => {
    expect(copy.nudge("Prajwal", at(0), new Date("2026-09-26T19:42:00Z")).body).toContain("1:12 AM");
    expect(istHour(new Date("2026-09-26T19:42:00Z"))).toBe(1);
  });
  it("real message text is kept for send-later messages", () => {
    for (const c of all((r) => copy.scheduled("Prajwal", "Good morning ☀️", r))) expect(c.body).toBe("Good morning ☀️");
  });
  it("pick never goes out of range", () => {
    expect(pick([1, 2, 3], () => 0.999999)).toBe(3);
    expect(pick([1, 2, 3], () => 0)).toBe(1);
  });
  it("long quotes are trimmed", () => {
    expect(copy.poll("P", "x".repeat(200), at(0)).body.length).toBeLessThan(140);
  });
});
