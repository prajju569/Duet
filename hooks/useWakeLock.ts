"use client";

import { useEffect } from "react";

/**
 * Keeps the screen on while `active` (music playing in Duet). Phones pause web
 * video when they auto-lock, so this is what keeps the song going.
 * The browser drops the lock whenever the tab is hidden, so we re-request on return.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      if (document.visibilityState !== "visible" || lock) return;
      try {
        lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void lock.release();
          lock = null;
          return;
        }
        lock.addEventListener("release", () => {
          lock = null;
        });
      } catch {
        // Denied (e.g. low battery mode) — nothing else to do.
      }
    };

    void request();
    document.addEventListener("visibilitychange", request);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", request);
      void lock?.release();
      lock = null;
    };
  }, [active]);
}
