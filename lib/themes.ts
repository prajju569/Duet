import type { Palette } from "./colors";

/** Room colour themes. "auto" (null) follows the current song's artwork. */
export const THEMES: Record<string, { label: string; palette: Palette }> = {
  rose: { label: "Rose", palette: { c1: "hsl(345 60% 32%)", c2: "hsl(15 62% 28%)", c3: "hsl(320 40% 20%)" } },
  sunset: { label: "Sunset", palette: { c1: "hsl(24 75% 34%)", c2: "hsl(345 60% 30%)", c3: "hsl(275 40% 20%)" } },
  ocean: { label: "Ocean", palette: { c1: "hsl(200 62% 28%)", c2: "hsl(228 50% 27%)", c3: "hsl(185 50% 16%)" } },
  forest: { label: "Forest", palette: { c1: "hsl(150 45% 22%)", c2: "hsl(95 35% 22%)", c3: "hsl(170 40% 13%)" } },
  lavender: { label: "Lavender", palette: { c1: "hsl(270 45% 32%)", c2: "hsl(300 35% 27%)", c3: "hsl(245 35% 19%)" } },
  midnight: { label: "Midnight", palette: { c1: "hsl(232 42% 24%)", c2: "hsl(260 35% 20%)", c3: "hsl(215 40% 12%)" } },
  gold: { label: "Gold", palette: { c1: "hsl(40 62% 30%)", c2: "hsl(20 52% 24%)", c3: "hsl(50 40% 13%)" } },
};

export function togetherText(seconds: number) {
  const m = Math.floor(seconds / 60);
  if (m < 1) return "just started";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export const MILESTONE_HOURS = [1, 5, 10, 24, 50, 100, 250, 500, 1000];
