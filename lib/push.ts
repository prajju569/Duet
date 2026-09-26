import "server-only";
import webpush from "web-push";
import { appendFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PushPayload = { title: string; body: string; url: string; tag: string; badge?: number };

export function pushConfigured() {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let ready = false;
function init() {
  if (ready) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:duet@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  ready = true;
}

/** Send to every device a user has turned notifications on for. Dead devices are cleaned up. */
export async function pushToUser(admin: SupabaseClient, userId: string, payload: PushPayload) {
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  if (!subs?.length) return 0;

  // Test hook: record instead of sending (the real push services aren't reachable in CI).
  if (process.env.PUSH_TEST_SINK) {
    for (const s of subs) appendFileSync(process.env.PUSH_TEST_SINK, JSON.stringify({ userId, endpoint: s.endpoint, payload }) + "\n");
    return subs.length;
  }

  init();
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), {
          TTL: 60 * 60 * 12,
          urgency: "high",
          topic: payload.tag.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, ""),
        });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
      }
    }),
  );
  return sent;
}
