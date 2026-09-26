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
  /** v4: when they last had the room open */
  lastSeenAt?: string | null;
  muted?: boolean;
};

export type Message = {
  id: string;
  room_id: string;
  user_id: string | null;
  kind: "text" | "system" | "sticker" | "image" | "voice" | "moment" | "dedication" | "poll";
  body: string;
  created_at: string;
  reply_to?: string | null;
  meta?: MessageMeta | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  pending?: boolean;
  failed?: boolean;
  /** Client-only preview for a photo / voice note that's still uploading. */
  localUrl?: string;
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
  position?: number | null;
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
  /** Has the room open on screen right now (not in the background). */
  active?: boolean;
};

/** Extra data carried by non-text messages. */
export type MessageMeta = {
  sticker?: string;
  /** 🥹 "missing you" ping */
  miss?: boolean;
  /** poll: the choices (the question is the message body) */
  options?: string[];
  // moment + dedication: the song
  videoId?: string;
  title?: string;
  channel?: string | null;
  thumbnail?: string | null;
  durationSec?: number | null;
  at?: number; // moment: seconds into the song
  note?: string; // dedication
  // image + voice
  path?: string;
  width?: number;
  height?: number;
  seconds?: number;
  /** voice note: loudness bars (0–100) for the waveform */
  peaks?: number[];
  mime?: string;
};

export type PollVote = { message_id: string; room_id: string; user_id: string; choice: number };
export type Countdown = { label: string; date: string };
