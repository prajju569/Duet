import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/profile";
import { getSchemaVersion } from "@/lib/features";
import { HomeClient } from "./HomeClient";
import type { HomeRoom } from "@/components/RoomsList";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Rooms with partner + last message. Falls back to a plain list if the rooms SQL isn't run yet. */
async function loadRooms(supabase: SupabaseClient, userId: string): Promise<HomeRoom[]> {
  const { data, error } = await supabase.rpc("my_rooms");
  if (!error && data) return data as HomeRoom[];
  const { data: rows } = await supabase.from("room_members").select("rooms(id, code, name, created_at)").eq("user_id", userId);
  type R = { id: string; code: string; name: string; created_at: string };
  return (rows ?? [])
    .map((m) => m.rooms as unknown as R | null)
    .filter((r): r is R => !!r)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((r) => ({ ...r, partner_id: null, partner_name: null, last_body: null, last_kind: null, last_user: null, last_at: r.created_at, unread: 0 }));
}

export default async function Home({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, rooms, schemaVersion] = await Promise.all([
    getMyProfile(supabase, user.id).then((data) => ({ data })),
    loadRooms(supabase, user.id),
    getSchemaVersion(supabase),
  ]);

  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : null;

  return (
    <HomeClient
      email={user.email ?? ""}
      displayName={profile?.display_name ?? null}
      username={profile?.username ?? null}
      rooms={rooms}
      canDelete={schemaVersion >= 5}
      canCustomUnsend={schemaVersion >= 8}
      meId={user.id}
      next={safeNext}
      error={error ?? null}
    />
  );
}
