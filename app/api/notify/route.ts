import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushConfigured, pushToUser } from "@/lib/push";

/**
 * "Tell my partner": called by the sender's phone after a message / nudge.
 * The server checks the sender is in the room, builds the text itself from the
 * stored message (so nobody can make up notification content), and pushes
 * only to the *other* member.
 */
export async function POST(req: NextRequest) {
  if (!pushConfigured()) return NextResponse.json({ sent: 0, reason: "not-configured" });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const roomId = typeof body.roomId === "string" ? body.roomId : "";
  const kind = body.kind === "nudge" ? "nudge" : body.kind === "listen" ? "listen" : "message";

  // RLS: only members can read the room → this doubles as the membership check.
  const { data: room } = await supabase.from("rooms").select("id, code, name").eq("id", roomId).maybeSingle();
  if (!room) return NextResponse.json({ error: "Not your room" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ sent: 0, reason: "no-service-key" });

  const [{ data: members }, { data: me }] = await Promise.all([
    admin.from("room_members").select("*").eq("room_id", room.id),
    admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);
  const partnerRow = (members ?? []).find((m) => m.user_id !== user.id);
  const partnerId = partnerRow?.user_id as string | undefined;
  if (!partnerId) return NextResponse.json({ sent: 0 });
  // They muted this room → no buzz (they'll still see it when they open Duet).
  if (partnerRow?.muted || partnerRow?.archived) return NextResponse.json({ sent: 0, reason: "muted" });
  // App-icon badge number (newer databases only).
  const { data: unread } = await admin.rpc("unread_total", { p_user: partnerId });
  const badge = typeof unread === "number" ? unread : undefined;
  const name = (me?.display_name ?? "Someone").split(" ")[0];
  const url = `/room/${room.code}`;

  if (kind === "listen") {
    // "Listen with me": say what's playing (read by the server, not trusted from the phone).
    const { data: ps } = await supabase.from("playback_state").select("title, is_playing").eq("room_id", room.id).maybeSingle();
    const song = ps?.title ? ` — ${String(ps.title).slice(0, 60)}` : "";
    const sent = await pushToUser(admin, partnerId, { title: `🎧 ${name}`, body: `${name} wants to listen together${song}`, url, tag: `listen-${room.id}`, badge });
    return NextResponse.json({ sent });
  }

  if (kind === "nudge") {
    const sent = await pushToUser(admin, partnerId, { title: `💭 ${name}`, body: `${name} is thinking of you`, url, tag: `nudge-${room.id}`, badge });
    return NextResponse.json({ sent });
  }

  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  const { data: msg } = await supabase.from("messages").select("id, user_id, kind, body, meta, room_id").eq("id", messageId).maybeSingle();
  if (!msg || msg.room_id !== room.id || msg.user_id !== user.id) return NextResponse.json({ error: "Unknown message" }, { status: 400 });

  if (msg.kind === "sticker" && (msg.meta as { miss?: boolean } | null)?.miss) {
    const sent = await pushToUser(admin, partnerId, { title: `🥹 ${name}`, body: `${name} is missing you`, url, tag: `miss-${room.id}`, badge });
    return NextResponse.json({ sent });
  }

  const text =
    msg.kind === "image" ? "📷 Photo" : msg.kind === "voice" ? "🎤 Voice note" : msg.kind === "sticker" ? `${msg.body} (sticker)` : msg.kind === "poll" ? `📊 Poll: ${msg.body}` : msg.kind === "game" ? `${msg.body} — tap to play` : msg.body;
  const sent = await pushToUser(admin, partnerId, {
    title: `${name} · ${room.name}`,
    body: text.length > 140 ? text.slice(0, 137) + "…" : text,
    url,
    tag: `msg-${room.id}`,
    badge,
  });
  return NextResponse.json({ sent });
}
