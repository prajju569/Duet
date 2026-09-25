import type { PlaybackState } from "./types";

/** Seek only when we're further than this from where we should be. */
export const DRIFT_THRESHOLD_SEC = 1.0;
/** How often to re-check drift while playing. */
export const DRIFT_CHECK_MS = 5000;

/** Parse a Postgres timestamptz (microsecond precision) into epoch ms, Safari-safe. */
export function parseTimestamp(ts: string): number {
  // "2026-09-25 16:00:00.123456+00" or "2026-09-25T16:00:00.123456+00:00"
  const m = ts.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/);
  if (!m) return Date.parse(ts);
  const [, date, time, frac = "0", zone = "Z"] = m;
  const ms = Number((frac + "000").slice(0, 3));
  let tz = zone;
  if (tz !== "Z") {
    const sign = tz[0];
    const digits = tz.slice(1).replace(":", "");
    tz = `${sign}${digits.slice(0, 2)}:${(digits.slice(2) || "00").padEnd(2, "0")}`;
  }
  const fracDigits = frac.slice(3);
  const extra = fracDigits ? Number(`0.${fracDigits}`) : 0;
  return Date.parse(`${date}T${time}.${String(ms).padStart(3, "0")}${tz}`) + extra;
}

export type PlaybackRow = {
  video_id: string | null;
  title: string | null;
  channel: string | null;
  thumbnail: string | null;
  duration_sec: number | null;
  added_by: string | null;
  is_playing: boolean;
  position_sec: number;
  updated_at: string;
  updated_by: string | null;
};

export function fromRow(row: PlaybackRow): PlaybackState {
  return {
    videoId: row.video_id,
    title: row.title,
    channel: row.channel,
    thumbnail: row.thumbnail,
    durationSec: row.duration_sec,
    addedBy: row.added_by,
    isPlaying: row.is_playing,
    positionSec: Number(row.position_sec) || 0,
    updatedAt: parseTimestamp(row.updated_at),
    updatedBy: row.updated_by,
  };
}

/**
 * Where the song should be right now.
 *   expected = positionSec + (now - updatedAt)   if isPlaying
 * `serverNowMs` must already be corrected for clock offset.
 */
export function expectedPosition(state: PlaybackState, serverNowMs: number): number {
  let pos = state.positionSec;
  if (state.isPlaying) pos += Math.max(0, serverNowMs - state.updatedAt) / 1000;
  if (state.durationSec && state.durationSec > 0) pos = Math.min(pos, state.durationSec);
  return Math.max(0, pos);
}

export function needsSeek(currentSec: number, expectedSec: number, threshold = DRIFT_THRESHOLD_SEC) {
  return Math.abs(currentSec - expectedSec) > threshold;
}

/** "Last action wins": only accept a server-stamped state that is not older than what we have. */
export function isNewer(incoming: PlaybackState, current: PlaybackState | null) {
  return !current || incoming.updatedAt >= current.updatedAt;
}

export type ClockSample = { t0: number; server: number; t1: number };

/**
 * NTP-style offset estimate: offset = server - (t0 + rtt/2).
 * Uses the lowest-latency sample, which has the tightest error bound (±rtt/2).
 * serverNow = Date.now() + offset
 */
export function estimateClockOffset(samples: ClockSample[]): { offset: number; rtt: number } {
  if (!samples.length) return { offset: 0, rtt: Infinity };
  let best = samples[0];
  for (const s of samples) if (s.t1 - s.t0 < best.t1 - best.t0) best = s;
  const rtt = best.t1 - best.t0;
  return { offset: best.server - (best.t0 + rtt / 2), rtt };
}
