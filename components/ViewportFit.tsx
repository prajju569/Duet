"use client";

import { useEffect } from "react";

/**
 * Phones' on-screen keyboards cover the page without shrinking it (iOS), so anything
 * pinned to the screen ends up hidden behind the keyboard. This publishes the *visible*
 * area as CSS variables (--vvh height, --vvt top) that full-screen layers size to
 * (see the `vv-fixed` utility), and scrolls whatever field you tap into view.
 */
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
        raf = requestAnimationFrame(() => el.scrollIntoView({ block: "center" }));
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
        el.scrollIntoView({ block: "center", behavior: "smooth" });
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
