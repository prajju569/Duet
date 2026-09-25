import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanTitle } from "@/lib/lyrics";

// Lyrics from LRCLIB (free, no key). Prefers time-synced lyrics whose length matches the song.
type LrcItem = { trackName: string; artistName: string; duration: number; syncedLyrics: string | null; plainLyrics: string | null; instrumental: boolean };

export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title") ?? "";
  const channel = req.nextUrl.searchParams.get("channel");
  const duration = Number(req.nextUrl.searchParams.get("duration")) || null;
  if (!title) return NextResponse.json({ error: "No song" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { track, artist } = cleanTitle(title, channel);
  const ua = { "User-Agent": "Duet (private listening app)" };
  const search = async (q: URLSearchParams) => {
    const res = await fetch(`https://lrclib.net/api/search?${q}`, { headers: ua, next: { revalidate: 86400 } });
    return res.ok ? ((await res.json()) as LrcItem[]) : [];
  };

  try {
    let items = artist ? await search(new URLSearchParams({ track_name: track, artist_name: artist })) : [];
    if (!items.length) items = await search(new URLSearchParams({ q: track }));
    items = items.filter((i) => !i.instrumental && (i.syncedLyrics || i.plainLyrics));
    if (!items.length) return NextResponse.json({ found: false });

    // Closest length wins (within 12 s if we know the duration); synced beats plain.
    const score = (i: LrcItem) => (duration ? Math.abs(i.duration - duration) : 0) + (i.syncedLyrics ? 0 : 5);
    const best = [...items].sort((a, b) => score(a) - score(b))[0];
    if (duration && Math.abs(best.duration - duration) > 12 && !items.some((i) => Math.abs(i.duration - duration) <= 12)) {
      // Nothing matches the length closely — still show it, flagged as a guess.
      return NextResponse.json({ found: true, guess: true, track: best.trackName, artist: best.artistName, synced: null, plain: best.plainLyrics ?? best.syncedLyrics?.replace(/\[[^\]]*\]/g, "") });
    }
    return NextResponse.json({ found: true, track: best.trackName, artist: best.artistName, synced: best.syncedLyrics, plain: best.plainLyrics });
  } catch {
    return NextResponse.json({ error: "Lyrics service unavailable" }, { status: 502 });
  }
}
