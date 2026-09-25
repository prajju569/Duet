/** Pull a YouTube video id out of anything people paste: links, share links, Shorts, YT Music. */
export function parseYouTubeId(input: string): string | null {
  const text = input.trim();
  if (!/youtu\.?be/i.test(text)) return null;
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1];
  }
  return null;
}
