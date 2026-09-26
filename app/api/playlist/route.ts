import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PLAYLIST_MAX, toTracks, type PlaylistItem, type VideoInfo } from "@/lib/playlist";

const API = process.env.YT_API_BASE || "https://www.googleapis.com/youtube/v3"; // override only for tests
const PRIVATE_MSG = "Couldn't open that playlist — it's probably Private. In YouTube Music set it to Unlisted, then paste the link again.";

/** Songs in a public / unlisted YouTube (Music) playlist. ~1 quota unit per 50 songs. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[A-Za-z0-9_-]{2,64}$/.test(id)) return NextResponse.json({ error: "That doesn't look like a playlist link" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const key = process.env.YT_API_KEY || process.env.NEXT_PUBLIC_YT_API_KEY;
  if (!key) return NextResponse.json({ error: "YouTube API key is not configured" }, { status: 500 });

  const get = async (path: string, params: Record<string, string>) => {
    const url = new URL(`${API}/${path}`);
    url.search = new URLSearchParams({ ...params, key }).toString();
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, j, reason: j?.error?.errors?.[0]?.reason as string | undefined };
  };

  const meta = await get("playlists", { part: "snippet,contentDetails", id });
  if (meta.reason === "quotaExceeded") return NextResponse.json({ error: "YouTube quota used up for today" }, { status: 502 });
  const pl = meta.j.items?.[0];
  if (!meta.ok || !pl) return NextResponse.json({ error: PRIVATE_MSG }, { status: 404 });

  const items: PlaylistItem[] = [];
  let pageToken = "";
  do {
    const page = await get("playlistItems", { part: "snippet,status", playlistId: id, maxResults: "50", ...(pageToken ? { pageToken } : {}) });
    if (!page.ok) return NextResponse.json({ error: PRIVATE_MSG }, { status: 404 });
    items.push(...(page.j.items ?? []));
    pageToken = page.j.nextPageToken ?? "";
  } while (pageToken && items.length < PLAYLIST_MAX);

  const ids = [...new Set(items.slice(0, PLAYLIST_MAX).map((i) => i.snippet?.resourceId?.videoId).filter(Boolean))] as string[];
  const videos: VideoInfo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const v = await get("videos", { part: "contentDetails,status", id: ids.slice(i, i + 50).join(",") });
    if (v.ok) videos.push(...(v.j.items ?? []));
  }

  const { tracks, skipped } = toTracks(items.slice(0, PLAYLIST_MAX), videos);
  const total = Number(pl.contentDetails?.itemCount ?? items.length);
  return NextResponse.json({
    title: String(pl.snippet?.title ?? "Playlist").replace(/^Album - /, ""),
    items: tracks,
    skipped,
    truncated: total > PLAYLIST_MAX,
  });
}
