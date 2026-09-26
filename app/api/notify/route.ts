import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushConfigured } from "@/lib/push";
import { copy, type Copy } from "@/lib/notifyCopy";
import { buzz, firstName } from "@/lib/notifyServer";
import type { GameKind } from "@/lib/games/types";

const KINDS = ["message", "nudge", "listen", "game", "reaction"] as const;
type Kind = (typeof KINDS)[number];

/**
 * "Tell my partner": called by the sender's phone after a message / nudge / move / reaction.
 * The server checks the sender is in the room, builds the text itself from what's stored
 * (so nobody can make up notification content), and pushes only to the *other* member.
 */
export async function POST(req: NextRequest) {
  if (!pushConfigured()) return NextResponse.json({ sent: 0, reason: "not-configured" });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const roomId = typeof body.roomId === "string" ? body.roomId : "";
  const kind: Kind = KINDS.includes(body.kind) ? body.kind : "message";

  // RLS: only members can read the room → this doubles as the membership check.
  const { data: room } = await supabase.from("rooms").select("id, code, name").eq("id", roomId).maybeSingle();
  if (!room) return NextResponse.json({ error: "Not your room" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ sent: 0, reason: "no-service-key" });

  const [{ data: members }, { data: me }] = await Promise.all([
    admin.from("room_members").select("user_id").eq("room_id", room.id),
    admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);
  const partnerId = (members ?? []).find((m) => m.user_id !== user.id)?.user_id as string | undefined;
  if (!partnerId) return NextResponse.json({ sent: 0 });
  const name = firstName(me?.display_name);
  const send = async (c: Copy | null, tag: string) => NextResponse.json({ sent: c ? await buzz(admin, room, partnerId, c, `${tag}-${room.id}`) : 0 });

  if (kind === "listen") {
    // Say what's playing (read by the server, not trusted from the phone).
    const { data: ps } = await supabase.from("playback_state").select("title").eq("room_id", room.id).maybeSingle();
    return send(copy.listen(name, ps?.title ? String(ps.title).slice(0, 60) : null), "listen");
  }
  if (kind === "nudge") return send(copy.nudge(name), "nudge");

  if (kind === "game") {
    const gameId = typeof body.gameId === "string" ? body.gameId : "";
    const { data: g } = await supabase.from("games").select("id, room_id, kind, state, status").eq("id", gameId).maybeSingle();
    if (!g || g.room_id !== room.id) return NextResponse.json({ error: "Unknown game" }, { status: 400 });
    const s = g.state as { players: [string, string]; turn?: number; fen?: string; winner?: unknown; result?: unknown };
    const them = s.players.indexOf(partnerId);
    if (them < 0) return NextResponse.json({ sent: 0 });
    const k = g.kind as GameKind;
    if (g.status === "done") {
      const w = k === "chess" ? s.result : s.winner;
      if (w === undefined || w === null) return NextResponse.json({ sent: 0 });
      return send(copy.gameOver(name, k, w === "draw" ? "draw" : w === them ? "won" : "lost"), `game-${g.id}`);
    }
    if (g.status !== "active") return NextResponse.json({ sent: 0 });
    const turn = k === "chess" ? (s.fen?.split(" ")[1] === "w" ? 0 : 1) : k === "wyr" || k === "mlt" ? null : s.turn;
    return send(turn === them ? copy.yourTurn(name, k) : null, `game-${g.id}`);
  }

  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  const { data: msg } = await supabase.from("messages").select("id, user_id, kind, body, meta, room_id, deleted_at").eq("id", messageId).maybeSingle();
  if (!msg || msg.room_id !== room.id) return NextResponse.json({ error: "Unknown message" }, { status: 400 });
  const meta = (msg.meta ?? {}) as { miss?: boolean; sticker?: string; title?: string; game?: GameKind };

  if (kind === "reaction") {
    // Only for reactions on *their* message, with the emoji read from the database.
    if (msg.user_id !== partnerId || msg.deleted_at) return NextResponse.json({ sent: 0 });
    const { data: r } = await supabase.from("message_reactions").select("emoji").eq("message_id", msg.id).eq("user_id", user.id).maybeSingle();
    if (!r?.emoji) return NextResponse.json({ sent: 0 });
    const text = msg.kind === "image" ? "📷 your photo" : msg.kind === "voice" ? "🎤 your voice note" : String(msg.body);
    return send(copy.reaction(name, r.emoji, text), "react");
  }

  if (msg.user_id !== user.id) return NextResponse.json({ error: "Unknown message" }, { status: 400 });
  if (msg.kind === "sticker" && meta.miss) return send(copy.miss(name), "miss");

  let c: Copy;
  switch (msg.kind) {
    case "image":
      c = copy.photo(name);
      break;
    case "voice":
      c = copy.voice(name);
      break;
    case "sticker":
      c = copy.sticker(name, meta.sticker ?? msg.body);
      break;
    case "poll":
      c = copy.poll(name, msg.body);
      break;
    case "dedication":
      c = copy.dedication(name, meta.title ?? msg.body.replace(/^💌\s*/, ""));
      break;
    case "game":
      c = meta.game ? copy.gameInvite(name, meta.game) : { title: `${name} · ${room.name}`, body: msg.body };
      break;
    default:
      // Real messages are never rewritten.
      c = { title: `${name} · ${room.name}`, body: msg.body };
  }
  return send(c, "msg");
}
