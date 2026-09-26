import type { SupabaseClient } from "@supabase/supabase-js";

export type MyProfile = { display_name: string | null; username: string | null };

/**
 * Reads your profile. If the PIN-login migration hasn't been run yet (no `username`
 * column), falls back to the old shape so the app keeps working in the meantime.
 */
export async function getMyProfile(supabase: SupabaseClient, userId: string): Promise<MyProfile | null> {
  // Newer databases keep the Duet ID private (only readable by you, through this function).
  const { data: mine, error: rpcError } = await supabase.rpc("my_profile");
  if (!rpcError) return ((Array.isArray(mine) ? mine[0] : mine) as MyProfile | undefined) ?? null;
  const { data, error } = await supabase.from("profiles").select("display_name, username").eq("id", userId).maybeSingle();
  if (!error) return data as MyProfile | null;
  const { data: old } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return old ? { display_name: old.display_name, username: null } : null;
}
