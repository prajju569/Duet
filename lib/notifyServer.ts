import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pushToUser } from "@/lib/push";
import type { Copy } from "@/lib/notifyCopy";

/** Buzz one room member — unless they muted / archived the room. Adds the app-icon badge. */
export async function buzz(
  admin: SupabaseClient,
  room: { id: string; code: string },
  userId: string,
  c: Copy,
  tag: string,
): Promise<number> {
  const { data: member } = await admin.from("room_members").select("*").eq("room_id", room.id).eq("user_id", userId).maybeSingle();
  if (!member || member.muted || member.archived) return 0;
  const { data: unread } = await admin.rpc("unread_total", { p_user: userId });
  const body = c.body.length > 160 ? c.body.slice(0, 157) + "…" : c.body;
  return pushToUser(admin, userId, {
    title: c.title,
    body,
    url: `/room/${room.code}`,
    tag,
    badge: typeof unread === "number" ? unread : undefined,
  });
}

/** Remember we sent something; false if it was already sent (so nothing buzzes twice). */
export async function firstTime(admin: SupabaseClient, roomId: string, key: string): Promise<boolean> {
  const { data, error } = await admin.from("notify_log").upsert({ room_id: roomId, key }, { onConflict: "room_id,key", ignoreDuplicates: true }).select();
  if (error) return false; // older database without the log → stay quiet rather than risk repeats
  return (data?.length ?? 0) > 0;
}

export const firstName = (s: string | null | undefined) => (s ?? "Someone").trim().split(/\s+/)[0] || "Someone";
