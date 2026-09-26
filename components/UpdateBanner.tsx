"use client";

import { useEffect, useState } from "react";

const MINE = process.env.NEXT_PUBLIC_BUILD || "dev";

/**
 * An app left open on a phone keeps running the old code after a deploy.
 * When a newer version is live, offer a one-tap refresh.
 */
export function UpdateBanner() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (MINE === "dev") return;
    let last = 0;
    const check = async () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 60_000) return;
      last = Date.now();
      try {
        const { build } = (await (await fetch("/api/version", { cache: "no-store" })).json()) as { build: string };
        if (build && build !== "dev" && build !== MINE) setStale(true);
      } catch {}
    };
    void check();
    const t = setInterval(check, 5 * 60_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  if (!stale) return null;
  return (
    <button
      onClick={() => location.reload()}
      className="animate-rise fixed inset-x-0 top-[max(env(safe-area-inset-top),8px)] z-[70] mx-auto flex w-fit items-center gap-2 rounded-full bg-cream px-4 py-2 text-sm font-semibold text-ink shadow-xl"
    >
      ✨ New version of Duet — tap to refresh
    </button>
  );
}
