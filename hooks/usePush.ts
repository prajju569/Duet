"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

let vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
/** Baked in at build time — or, if the app was built before the key was added, asked for. */
async function getKey() {
  if (vapid) return vapid;
  try {
    const r = await fetch("/api/push-key");
    vapid = ((await r.json()) as { key: string | null }).key ?? "";
  } catch {}
  return vapid;
}

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export type PushStatus = "unsupported" | "needs-install" | "blocked" | "off" | "on";

/** Web push on this device: status + turn on / off. */
export function usePush(userId: string, enabled: boolean) {
  const [status, setStatus] = useState<PushStatus>("unsupported");

  const refresh = useCallback(async () => {
    if (!enabled || !(await getKey())) return setStatus("unsupported");
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return setStatus(ios && !standalone ? "needs-install" : "unsupported");
    }
    if (Notification.permission === "denied") return setStatus("blocked");
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    setStatus(sub && Notification.permission === "granted" ? "on" : "off");
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !("serviceWorker" in navigator)) return void refresh();
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.update().catch(() => {})) // pick up a new worker right after a deploy
      .then(refresh, refresh);
  }, [enabled, refresh]);

  const turnOn = useCallback(async () => {
    try {
      return await subscribe();
    } catch {
      await refresh();
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refresh]);

  const subscribe = async () => {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      await refresh();
      return false;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(await getKey()) }));
    const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const { error } = await getSupabase()
      .from("push_subscriptions")
      .upsert({ user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: "endpoint" });
    await refresh();
    return !error;
  };

  const turnOff = useCallback(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await getSupabase().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
    await refresh();
  }, [refresh]);

  return { status, turnOn, turnOff };
}
