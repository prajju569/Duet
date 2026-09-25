import { redirect } from "next/navigation";
import { preconnect } from "react-dom";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/profile";
import { getSchemaVersion } from "@/lib/features";
import { RoomClient } from "@/components/room/RoomClient";
import type { Favourite, Member, Message, QueueItem, Reaction } from "@/lib/types";
import type { PlaybackRow } from "@/lib/sync";

const PAGE_SIZE = 60;

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ invite?: string }>;
}) {
  const { code: rawCode } = await params;
  const { invite } = await searchParams;
  const code = rawCode.toUpperCase();

  // Start warming up YouTube while we talk to the database.
  preconnect("https://www.youtube.com");
  preconnect("https://i.ytimg.com");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/room/${code}`)}`);

  // Profile + join in parallel. join_room is a no-op if you're already in.
  const [{ data: profile }, { data: room, error }] = await Promise.all([
    getMyProfile(supabase, user.id).then((data) => ({ data })),
    supabase.rpc("join_room", { p_code: code }),
  ]);
  if (!profile?.display_name) redirect(`/?next=${encodeURIComponent(`/room/${code}`)}`);
  if (error || !room) {
    const reason = error?.message.includes("ROOM_FULL") ? "full" : "notfound";
    redirect(`/?error=${reason}`);
  }

  // Everything the room needs, fetched at once so the page arrives already filled in.
  const [{ data: rows }, { data: latest }, { data: queue }, { data: playback }, { data: favourites }, schemaVersion] = await Promise.all([
    supabase.from("room_members").select("user_id, last_read_at").eq("room_id", room.id),
    supabase.from("messages").select("*").eq("room_id", room.id).order("created_at", { ascending: false }).limit(PAGE_SIZE),
    supabase.from("queue_items").select("*").eq("room_id", room.id).eq("status", "queued").order("created_at"),
    supabase.from("playback_state").select("*").eq("room_id", room.id).maybeSingle(),
    supabase.from("favourites").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    getSchemaVersion(supabase),
  ]);

  const messages = ((latest ?? []) as Message[]).reverse();
  const ids = (rows ?? []).map((r) => r.user_id as string);
  const [{ data: profiles }, { data: reactions }] = await Promise.all([
    supabase.from("profiles").select("id, display_name").in("id", ids),
    messages.length
      ? supabase.from("message_reactions").select("*").eq("room_id", room.id).in("message_id", messages.map((m) => m.id))
      : Promise.resolve({ data: [] as Reaction[] }),
  ]);

  const members: Member[] = (rows ?? []).map((r) => ({
    userId: r.user_id,
    lastReadAt: r.last_read_at,
    name: profiles?.find((p) => p.id === r.user_id)?.display_name ?? "Someone",
  }));

  return (
    <RoomClient
      key={room.id}
      room={{
        id: room.id,
        code: room.code,
        name: room.name,
        autoplay: room.autoplay ?? true,
        listenedSeconds: Number(room.listened_seconds ?? 0),
        theme: room.theme ?? null,
        scheduled: room.scheduled ?? null,
      }}
      me={{ id: user.id, name: profile.display_name, username: profile.username ?? null }}
      openInvite={invite === "1" && members.length < 2}
      features={{ v2: schemaVersion >= 2 }}
      initialMembers={members}
      initial={{
        messages,
        hasOlder: (latest ?? []).length === PAGE_SIZE,
        reactions: (reactions ?? []) as Reaction[],
        queue: (queue ?? []) as QueueItem[],
        favourites: (favourites ?? []) as Favourite[],
        playback: (playback as PlaybackRow | null) ?? null,
      }}
    />
  );
}
