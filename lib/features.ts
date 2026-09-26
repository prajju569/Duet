import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Which database version is installed. New features switch on only when the
 * matching SQL has been run, so the live app never breaks while it's pending.
 */
export async function getSchemaVersion(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("duet_schema_version");
  return error || typeof data !== "number" ? 1 : data;
}

export type Features = { v2: boolean; v4?: boolean; v5?: boolean };
