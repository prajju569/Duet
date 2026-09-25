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
  const kind = body.kind === "nudge" ? "nudge" : "message";

  // RLS: only members can read the room → this doubles as the membership check.
  const { data: room } = await supabase.from("rooms").select("id, code, name").eq("id", roomId).maybeSingle();
  if (!room) return NextResponse.json({ error: "Not your room" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ sent: 0, reason: "no-service-key" });

  const [{ data: members }, { data: me }] = await Promise.all([
    admin.from("room_members").select("user_id").eq("room_id", room.id),
    admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);
  const partnerId = (members ?? []).map((m) => m.user_id as string).find((id) => id !== user.id);
  if (!partnerId) return NextResponse.json({ sent: 0 });
  const name = (me?.display_name ?? "Someone").split(" ")[0];
  const url = `/room/${room.code}`;

  if (kind === "nudge") {
    const sent = await pushToUser(admin, partnerId, { title: `💭 ${name}`, body: `${name} is thinking of you`, url, tag: `nudge-${room.id}` });
    return NextResponse.json({ sent });
  }

  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  const { data: msg } = await supabase.from("messages").select("id, user_id, kind, body, room_id").eq("id", messageId).maybeSingle();
  if (!msg || msg.room_id !== room.id || msg.user_id !== user.id) return NextResponse.json({ error: "Unknown message" }, { status: 400 });

  const text =
    msg.kind === "image" ? "📷 Photo" : msg.kind === "voice" ? "🎤 Voice note" : msg.kind === "sticker" ? `${msg.body} (sticker)` : msg.body;
  const sent = await pushToUser(admin, partnerId, {
    title: `${name} · ${room.name}`,
    body: text.length > 140 ? text.slice(0, 137) + "…" : text,
    url,
    tag: `msg-${room.id}`,
  });
  return NextResponse.json({ sent });
}
