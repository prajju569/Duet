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

export type PlaylistLink = { id: string } | { error: string };

/**
 * A YouTube / YouTube Music playlist (or album) link → its playlist id.
 * Returns an explanation for lists that can't be read without signing in to Google.
 */
export function parsePlaylistLink(input: string): PlaylistLink | null {
  const text = input.trim();
  if (!/youtu\.?be/i.test(text)) return null;
  const m = text.match(/[?&]list=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const id = m[1];
  if (id === "LM" || id === "LL" || id === "WL") {
    return { error: "Liked songs & Watch later are private to your Google account — copy them into a playlist set to Unlisted, then paste that link." };
  }
  if (id.startsWith("RD")) return null; // auto-made "Mix" radio: treat the link as the single song
  return { id };
}
