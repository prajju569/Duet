import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RoomClient } from "@/components/room/RoomClient";
import type { Member } from "@/lib/types";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/room/${code}`)}`);

  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  if (!profile?.display_name) redirect(`/?next=${encodeURIComponent(`/room/${code}`)}`);

  // Joins you if there's space (max 2); a no-op if you're already in.
  const { data: room, error } = await supabase.rpc("join_room", { p_code: code });
  if (error || !room) {
    const reason = error?.message.includes("ROOM_FULL") ? "full" : "notfound";
    redirect(`/?error=${reason}`);
  }

  const { data: rows } = await supabase.from("room_members").select("user_id, last_read_at").eq("room_id", room.id);
  const ids = (rows ?? []).map((r) => r.user_id as string);
  const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", ids);

  const members: Member[] = (rows ?? []).map((r) => ({
    userId: r.user_id,
    lastReadAt: r.last_read_at,
    name: profiles?.find((p) => p.id === r.user_id)?.display_name ?? "Someone",
  }));

  return (
    <RoomClient
      key={room.id}
      room={{ id: room.id, code: room.code, name: room.name }}
      me={{ id: user.id, name: profile.display_name }}
      initialMembers={members}
    />
  );
}
