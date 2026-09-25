export type Track = {
  videoId: string;
  title: string;
  channel: string | null;
  thumbnail: string | null;
  durationSec: number | null;
};

/** The single shared playback state of a room. `updatedAt` is server time in ms. */
export type PlaybackState = {
  videoId: string | null;
  title: string | null;
  channel: string | null;
  thumbnail: string | null;
  durationSec: number | null;
  addedBy: string | null;
  isPlaying: boolean;
  positionSec: number;
  updatedAt: number;
  updatedBy: string | null;
};

export type Member = {
  userId: string;
  name: string;
  lastReadAt: string;
};

export type Message = {
  id: string;
  room_id: string;
  user_id: string | null;
  kind: "text" | "system";
  body: string;
  created_at: string;
  pending?: boolean;
  failed?: boolean;
};

export type Reaction = {
  message_id: string;
  user_id: string;
  room_id: string;
  emoji: string | null;
};

export type QueueItem = {
  id: string;
  room_id: string;
  video_id: string;
  title: string;
  channel: string | null;
  thumbnail: string | null;
  duration_sec: number | null;
  added_by: string | null;
  status: "queued" | "played" | "removed";
  created_at: string;
};

export type Favourite = {
  id: string;
  user_id: string;
  video_id: string;
  title: string;
  channel: string | null;
  thumbnail: string | null;
  duration_sec: number | null;
  created_at: string;
};

export type PresenceInfo = {
  userId: string;
  name: string;
  listening: boolean;
};
