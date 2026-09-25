import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Track } from "@/lib/types";

// Title + channel for a pasted YouTube link. Uses YouTube's free oEmbed — no search quota.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return NextResponse.json({ error: "That doesn't look like a YouTube link" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const res = await fetch(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: res.status === 401 || res.status === 403 ? "That video can't be played outside YouTube" : "Couldn't find that video" },
      { status: 404 },
    );
  }
  const j = await res.json();
  const track: Track = {
    videoId: id,
    title: j.title ?? "YouTube video",
    channel: j.author_name ?? null,
    thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    durationSec: null,
  };
  return NextResponse.json({ items: [track] });
}
