import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/profile";
import { HomeClient } from "./HomeClient";

export default async function Home({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    getMyProfile(supabase, user.id).then((data) => ({ data })),
    supabase.from("room_members").select("room_id, rooms(id, code, name, created_at)").eq("user_id", user.id),
  ]);

  type RoomRow = { id: string; code: string; name: string; created_at: string };
  const rooms = (memberships ?? [])
    .map((m) => m.rooms as unknown as RoomRow | null)
    .filter((r): r is RoomRow => !!r)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : null;

  return (
    <HomeClient
      email={user.email ?? ""}
      displayName={profile?.display_name ?? null}
      username={profile?.username ?? null}
      rooms={rooms}
      next={safeNext}
      error={error ?? null}
    />
  );
}
