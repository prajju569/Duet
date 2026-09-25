import { describe, expect, it } from "vitest";
import { estimateClockOffset, expectedPosition, fromRow, isNewer, needsSeek, parseTimestamp } from "./sync";
import type { PlaybackState } from "./types";

const base: PlaybackState = {
  videoId: "abc",
  title: "Kesariya",
  channel: null,
  thumbnail: null,
  durationSec: 268,
  addedBy: null,
  isPlaying: true,
  positionSec: 10,
  updatedAt: 1_000_000,
  updatedBy: "u1",
};

describe("expectedPosition", () => {
  it("advances with time while playing", () => {
    expect(expectedPosition(base, 1_005_500)).toBeCloseTo(15.5);
  });
  it("stays put while paused", () => {
    expect(expectedPosition({ ...base, isPlaying: false }, 1_060_000)).toBe(10);
  });
  it("clamps to duration and never goes negative", () => {
    expect(expectedPosition(base, 1_000_000 + 999_000)).toBe(268);
    expect(expectedPosition(base, 900_000)).toBe(10);
  });
});

describe("needsSeek", () => {
  it("uses a 1s threshold", () => {
    expect(needsSeek(10, 10.9)).toBe(false);
    expect(needsSeek(10, 11.2)).toBe(true);
    expect(needsSeek(12.5, 11)).toBe(true);
  });
});

describe("isNewer (last action wins)", () => {
  it("accepts newer or equal, rejects older", () => {
    expect(isNewer(base, null)).toBe(true);
    expect(isNewer({ ...base, updatedAt: 1_000_001 }, base)).toBe(true);
    expect(isNewer(base, base)).toBe(true);
    expect(isNewer({ ...base, updatedAt: 999_999 }, base)).toBe(false);
  });
});

describe("estimateClockOffset", () => {
  it("picks the lowest-rtt sample", () => {
    // client clock is 2000ms behind server
    const r = estimateClockOffset([
      { t0: 0, server: 2400, t1: 800 }, // rtt 800 -> offset 2000 (noisy)
      { t0: 1000, server: 3050, t1: 1100 }, // rtt 100 -> offset 2000
      { t0: 2000, server: 4300, t1: 2500 }, // rtt 500 -> offset 2050
    ]);
    expect(r.rtt).toBe(100);
    expect(r.offset).toBe(2000);
  });
});

describe("parseTimestamp", () => {
  it("handles postgres microsecond timestamps", () => {
    expect(parseTimestamp("2026-09-25T16:00:00.123456+00:00")).toBeCloseTo(Date.UTC(2026, 8, 25, 16, 0, 0, 123) + 0.456, 3);
    expect(parseTimestamp("2026-09-25 16:00:00.5+05:30")).toBe(Date.UTC(2026, 8, 25, 10, 30, 0, 500));
    expect(parseTimestamp("2026-09-25T16:00:00Z")).toBe(Date.UTC(2026, 8, 25, 16));
  });
  it("fromRow maps a db row", () => {
    const s = fromRow({
      video_id: "v", title: "t", channel: null, thumbnail: null, duration_sec: null, added_by: null,
      is_playing: true, position_sec: 3.5, updated_at: "2026-09-25T16:00:00+00:00", updated_by: "u",
    });
    expect(s.positionSec).toBe(3.5);
    expect(s.updatedAt).toBe(Date.UTC(2026, 8, 25, 16));
  });
});
