import type { SupabaseClient } from "@supabase/supabase-js";

/** App-icon badge = my unread messages across all rooms (phones & desktops that support it). */
export async function updateAppBadge(supabase: SupabaseClient, known?: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  if (!nav.setAppBadge) return;
  let n = known;
  if (n === undefined) {
    const { data, error } = await supabase.rpc("my_unread_total");
    if (error) return;
    n = Number(data) || 0;
  }
  try {
    await (n > 0 ? nav.setAppBadge(n) : nav.clearAppBadge?.());
  } catch {}
}
