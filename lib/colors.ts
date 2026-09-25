"use client";

import { thumbUrl } from "./youtube";

export type Palette = { c1: string; c2: string; c3: string };

export const DEFAULT_PALETTE: Palette = {
  c1: "hsl(345 55% 28%)",
  c2: "hsl(20 60% 24%)",
  c3: "hsl(280 35% 18%)",
};

const cache = new Map<string, Palette>();

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Keep colours moody: dark enough for white text, saturated enough to feel warm. */
function tone(h: number, s: number, lightness: number) {
  const sat = Math.round(Math.min(70, Math.max(28, s * 100)));
  return `hsl(${Math.round(h)} ${sat}% ${lightness}%)`;
}

/**
 * Pull 2–3 dominant colours from a YouTube thumbnail. The image is loaded through
 * Next's same-origin image optimizer so the canvas isn't tainted by CORS.
 */
export async function paletteForVideo(videoId: string): Promise<Palette> {
  const hit = cache.get(videoId);
  if (hit) return hit;

  const src = `/_next/image?url=${encodeURIComponent(thumbUrl(videoId))}&w=64&q=75`;
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();

  const w = 32, h = 18;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return DEFAULT_PALETTE;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  // 12 hue buckets, weighted by saturation so greys don't win.
  const buckets = Array.from({ length: 12 }, () => ({ weight: 0, h: 0, s: 0 }));
  for (let i = 0; i < data.length; i += 4) {
    const [hh, ss, ll] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (ll < 0.08 || ll > 0.94) continue;
    const wgt = 0.15 + ss * (1 - Math.abs(ll - 0.5));
    const b = buckets[Math.floor(hh / 30) % 12];
    b.weight += wgt; b.h += hh * wgt; b.s += ss * wgt;
  }
  const ranked = buckets
    .filter((b) => b.weight > 0)
    .map((b) => ({ h: b.h / b.weight, s: b.s / b.weight, weight: b.weight }))
    .sort((a, b) => b.weight - a.weight);

  if (!ranked.length) return DEFAULT_PALETTE;
  const a = ranked[0];
  const b = ranked[1] ?? { ...a, h: (a.h + 30) % 360 };
  const c = ranked[2] ?? { ...b, h: (b.h + 40) % 360 };
  const palette = { c1: tone(a.h, a.s, 30), c2: tone(b.h, b.s, 24), c3: tone(c.h, c.s * 0.8, 16) };
  cache.set(videoId, palette);
  return palette;
}
