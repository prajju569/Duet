import { parseIsoDuration } from "./format";
import type { Track } from "./types";

export const PLAYLIST_MAX = 200;

export type PlaylistItem = {
  snippet?: {
    title?: string;
    videoOwnerChannelTitle?: string;
    resourceId?: { videoId?: string };
    thumbnails?: Record<string, { url: string }>;
  };
  status?: { privacyStatus?: string };
};
export type VideoInfo = { id: string; contentDetails?: { duration?: string }; status?: { embeddable?: boolean } };

/** Playlist rows + video details → playable tracks (drops private/deleted/non-embeddable/live, dedupes). */
export function toTracks(items: PlaylistItem[], videos: VideoInfo[]): { tracks: Track[]; skipped: number } {
  const info = new Map(videos.map((v) => [v.id, v]));
  const seen = new Set<string>();
  const tracks: Track[] = [];
  let skipped = 0;
  for (const it of items) {
    const id = it.snippet?.resourceId?.videoId;
    const v = id ? info.get(id) : undefined;
    const duration = parseIsoDuration(v?.contentDetails?.duration);
    const playable = !!id && !!v && v.status?.embeddable !== false && duration !== 0 && it.status?.privacyStatus !== "private";
    if (!playable || seen.has(id!)) {
      if (!seen.has(id ?? "")) skipped++;
      continue;
    }
    seen.add(id!);
    const s = it.snippet!;
    tracks.push({
      videoId: id!,
      title: s.title ?? "Untitled",
      channel: (s.videoOwnerChannelTitle ?? "").replace(/ - Topic$/, "") || null,
      thumbnail: s.thumbnails?.medium?.url ?? s.thumbnails?.default?.url ?? null,
      durationSec: duration,
    });
  }
  return { tracks, skipped };
}
