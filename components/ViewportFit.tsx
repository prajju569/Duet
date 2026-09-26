"use client";

import { useEffect } from "react";
import { centerIn } from "@/lib/scroll";

/**
 * Phones' on-screen keyboards cover the page without shrinking it (iOS), so anything
 * pinned to the screen ends up hidden behind the keyboard. This publishes the *visible*
 * area as CSS variables (--vvh height, --vvt top) that full-screen layers size to
 * (see the `vv-fixed` utility), and scrolls whatever field you tap into view.
 */
/**
 * Bring a field into view by scrolling only the list it sits in (overflow auto/scroll).
 * Screen-sized layers already shrink to the visible area, so that's all it takes.
 */
function reveal(el: HTMLElement, smooth = false) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy !== "auto" && oy !== "scroll") || p.scrollHeight <= p.clientHeight) continue;
    const box = p.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top < box.top || r.bottom > box.bottom) centerIn(p, el, smooth);
    return;
  }
}

export function ViewportFit() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    let lastH = vv?.height ?? 0;
    let raf = 0;
    const update = () => {
      if (!vv) return;
      root.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
      root.style.setProperty("--vvt", `${Math.round(vv.offsetTop)}px`);
      // Keyboard just opened (visible area shrank)? Keep the field you're typing in on screen.
      const shrank = vv.height < lastH - 40;
      lastH = vv.height;
      const el = document.activeElement as HTMLElement | null;
      if (shrank && el?.matches("input, textarea")) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => reveal(el));
      }
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);

    let t: ReturnType<typeof setTimeout> | undefined;
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || !el.matches("input:not([type=range]):not([type=checkbox]), textarea")) return;
      clearTimeout(t);
      // Wait for the keyboard to finish sliding up, then bring the field into view.
      t = setTimeout(() => {
        update();
        reveal(el, true);
      }, 320);
    };
    document.addEventListener("focusin", onFocus);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      document.removeEventListener("focusin", onFocus);
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
