"use client";

import { useEffect, useRef } from "react";

/**
 * Android's back button / gesture should close what's on top (player, menu, sheet)
 * instead of leaving the room — like every native app. Each open layer adds a history
 * entry; "back" pops it and closes the layer. Closing it by hand removes the entry.
 */
type Layer = { id: number; close: () => void };
const stack: Layer[] = [];
let seq = 0;
let skipPops = 0;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    if (skipPops > 0) {
      skipPops--;
      return;
    }
    stack.pop()?.close();
  });
}

export function useBackToClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!open) return;
    const layer: Layer = { id: ++seq, close: () => closeRef.current() };
    stack.push(layer);
    // Keep the router's own state so Next.js treats "back" as staying on this page.
    window.history.pushState({ ...(window.history.state ?? {}), duetLayer: layer.id }, "");
    return () => {
      const i = stack.indexOf(layer);
      if (i < 0) return; // closed by the back button: its entry is already gone
      stack.splice(i, 1);
      // Closed by hand: drop our history entry — but only if we're still on it
      // (not if the page is navigating away).
      if (window.history.state?.duetLayer === layer.id) {
        skipPops++;
        window.history.back();
      }
    };
  }, [open]);
}
