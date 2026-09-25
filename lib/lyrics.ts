export type LyricLine = { t: number; text: string };

/**
 * YouTube titles are messy ("Kesariya - Full Song | Brahmāstra | Ranbir Kapoor | Arijit Singh").
 * Turn one into { track, artist } a lyrics search can match.
 */
export function cleanTitle(rawTitle: string, channel?: string | null): { track: string; artist: string | null } {
  let t = rawTitle
    .replace(/\[[^\]]*\]|\([^)]*\)|【[^】]*】/g, " ") // (Official Video) [Lyrics] 【MV】
    .replace(/\b(official|full|lyrical|lyrics?|video|audio|song|music|hd|4k|mv|visualizer|remastered)\b/gi, " ")
    .replace(/[|｜•·]/g, "|")
    .trim();
  const parts = t.split("|").map((p) => p.trim()).filter(Boolean);
  t = parts[0] ?? t;
  let artist: string | null = null;
  const dash = t.split(/\s[-–—]\s/);
  if (dash.length >= 2) {
    // "Artist - Song" or "Song - Film"; prefer the channel name to decide.
    const [a, b] = dash;
    const ch = (channel ?? "").toLowerCase().replace(/\s*-\s*topic$/, "").replace(/vevo$/, "");
    if (ch && a.toLowerCase().includes(ch.split(" ")[0])) {
      artist = a.trim();
      t = b;
    } else {
      t = a;
    }
  }
  if (!artist && channel) artist = channel.replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim() || null;
  return { track: t.replace(/\s+/g, " ").replace(/[-–—:,\s]+$/, "").trim(), artist };
}

/** Parse LRC ("[01:23.45] line") into timed lines. */
export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const s of stamps) {
      const frac = s[3] ? Number(`0.${s[3]}`) : 0;
      out.push({ t: Number(s[1]) * 60 + Number(s[2]) + frac, text });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Index of the line being sung at `sec` (-1 before the first line). */
export function currentLine(lines: LyricLine[], sec: number): number {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= sec + 0.25) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export function sortQueue<T extends { position?: number | null; created_at: string }>(items: T[]): T[] {
  const key = (x: T) => (x.position ?? Date.parse(x.created_at) / 1000);
  return [...items].sort((a, b) => key(a) - key(b) || a.created_at.localeCompare(b.created_at));
}
