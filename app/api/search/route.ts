import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseIsoDuration } from "@/lib/format";
import type { Track } from "@/lib/types";

const API = "https://www.googleapis.com/youtube/v3";

function decodeEntities(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ items: [] });

  // Only signed-in people can spend our YouTube quota.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const key = process.env.YT_API_KEY || process.env.NEXT_PUBLIC_YT_API_KEY;
  if (!key) return NextResponse.json({ error: "YouTube API key is not configured" }, { status: 500 });

  const search = new URL(`${API}/search`);
  search.search = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    videoCategoryId: "10", // Music
    maxResults: "15",
    q,
    key,
  }).toString();

  const res = await fetch(search, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const reason = body?.error?.errors?.[0]?.reason;
    const msg = reason === "quotaExceeded" ? "YouTube search quota used up for today" : "YouTube search failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
  const json = await res.json();
  type SearchItem = {
    id: { videoId: string };
    snippet: { title: string; channelTitle: string; thumbnails: Record<string, { url: string }> };
  };
  const items: SearchItem[] = (json.items ?? []).filter((i: SearchItem) => i.id?.videoId);

  // Fetch durations (1 quota unit) so the seek bar knows the song length.
  const durations = new Map<string, number | null>();
  if (items.length) {
    const vids = new URL(`${API}/videos`);
    vids.search = new URLSearchParams({
      part: "contentDetails",
      id: items.map((i) => i.id.videoId).join(","),
      key,
    }).toString();
    const vr = await fetch(vids, { cache: "no-store" });
    if (vr.ok) {
      const vj = await vr.json();
      for (const v of vj.items ?? []) durations.set(v.id, parseIsoDuration(v.contentDetails?.duration));
    }
  }

  const tracks: Track[] = items.map((i) => ({
    videoId: i.id.videoId,
    title: decodeEntities(i.snippet.title),
    channel: decodeEntities(i.snippet.channelTitle ?? ""),
    thumbnail: i.snippet.thumbnails?.medium?.url ?? i.snippet.thumbnails?.default?.url ?? null,
    durationSec: durations.get(i.id.videoId) ?? null,
  }));

  // Live streams report 0 duration and can't be synced meaningfully.
  return NextResponse.json({ items: tracks.filter((t) => t.durationSec !== 0) });
}
