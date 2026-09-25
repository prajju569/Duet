"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import {
  DRIFT_CHECK_MS,
  estimateClockOffset,
  expectedPosition,
  fromRow,
  isNewer,
  needsSeek,
  type ClockSample,
  type PlaybackRow,
} from "@/lib/sync";
import { loadYouTubeApi } from "@/lib/youtube";
import type { PlaybackState, Track } from "@/lib/types";

// YT.PlayerState values, inlined so we don't depend on window.YT at import time.
const UNSTARTED = -1, ENDED = 0, PLAYING = 1, PAUSED = 2, BUFFERING = 3, CUED = 5;

const EMPTY: PlaybackState = {
  videoId: null, title: null, channel: null, thumbnail: null, durationSec: null,
  addedBy: null, isPlaying: false, positionSec: 0, updatedAt: 0, updatedBy: null,
};

type Options = {
  roomId: string;
  meId: string;
  /** Send the new state to the other person over the Broadcast channel. */
  broadcast: (s: PlaybackState) => void;
  onError: (msg: string) => void;
};

export function usePlaybackSync({ roomId, meId, broadcast, onError }: Options) {
  const supabase = getSupabase();

  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const readyRef = useRef(false);
  const unlockedRef = useRef(false);
  const loadedVideoRef = useRef<string | null>(null);
  const offsetRef = useRef(0);

  /** Latest state stamped by the server that we accepted ("last action wins"). */
  const serverStateRef = useRef<PlaybackState | null>(null);
  /** What we're currently showing / applying (may be an optimistic local action). */
  const shownRef = useRef<PlaybackState | null>(null);
  const optimisticRef = useRef(false);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<PlaybackState | null>(null);
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [playerState, setPlayerState] = useState(UNSTARTED);

  const broadcastRef = useRef(broadcast);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    broadcastRef.current = broadcast;
    onErrorRef.current = onError;
  });

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  // ── Core: make the local player match a state ──────────────────────
  const watchForBlockedAutoplay = useCallback(() => {
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      const p = playerRef.current;
      const s = shownRef.current;
      if (!p || !s?.isPlaying || !unlockedRef.current) return;
      const ps = p.getPlayerState?.();
      // iPhones often refuse to start a cross-origin video without a tap inside it.
      if (ps === UNSTARTED || ps === CUED || ps === PAUSED) setNeedsTap(true);
    }, 2500);
  }, []);

  const apply = useCallback(
    (s: PlaybackState | null) => {
      const p = playerRef.current;
      if (!s || !p || !readyRef.current || !unlockedRef.current) return;

      if (!s.videoId) {
        if (loadedVideoRef.current) p.stopVideo();
        loadedVideoRef.current = null;
        return;
      }

      const expected = expectedPosition(s, serverNow());

      if (loadedVideoRef.current !== s.videoId) {
        loadedVideoRef.current = s.videoId;
        if (s.isPlaying) {
          p.loadVideoById({ videoId: s.videoId, startSeconds: expected });
          watchForBlockedAutoplay();
        } else {
          p.cueVideoById({ videoId: s.videoId, startSeconds: expected });
        }
        return;
      }

      const ps = p.getPlayerState();

      if (!s.isPlaying) {
        if (ps === PLAYING || ps === BUFFERING) p.pauseVideo();
        if (ps === CUED || ps === UNSTARTED) {
          // seekTo() would start a cued video, so re-cue at the right spot instead.
          if (needsSeek(p.getCurrentTime() || 0, expected)) p.cueVideoById({ videoId: s.videoId, startSeconds: expected });
          return;
        }
        if (needsSeek(p.getCurrentTime(), expected)) p.seekTo(expected, true);
        return;
      }

      // Song is over by the clock: don't restart it, let ENDED → advance handle it.
      if (s.durationSec && expected >= s.durationSec - 0.25) return;

      if (needsSeek(p.getCurrentTime(), expected)) p.seekTo(expected, true);
      if (ps !== PLAYING && ps !== BUFFERING) {
        p.playVideo();
        watchForBlockedAutoplay();
      }
    },
    [serverNow, watchForBlockedAutoplay],
  );

  const show = useCallback(
    (s: PlaybackState) => {
      shownRef.current = s;
      setState(s);
      apply(s);
    },
    [apply],
  );

  /** Accept a server-stamped state if it's the latest action. */
  const acceptServer = useCallback(
    (s: PlaybackState) => {
      if (!isNewer(s, serverStateRef.current)) return false;
      serverStateRef.current = s;
      optimisticRef.current = false;
      show(s);
      return true;
    },
    [show],
  );

  const fetchState = useCallback(async () => {
    const { data } = await supabase.from("playback_state").select("*").eq("room_id", roomId).maybeSingle();
    if (data) acceptServer(fromRow(data as PlaybackRow));
  }, [supabase, roomId, acceptServer]);

  // ── Clock offset (NTP-style, best of 5) ────────────────────────────
  const syncClock = useCallback(async () => {
    const samples: ClockSample[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      const { data, error } = await supabase.rpc("server_time");
      const t1 = Date.now();
      if (!error && typeof data === "number") samples.push({ t0, server: data, t1 });
    }
    if (samples.length) offsetRef.current = estimateClockOffset(samples).offset;
  }, [supabase]);

  // ── Player lifecycle ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    loadYouTubeApi().then((YTApi) => {
      if (cancelled) return;
      // Give YT its own node so React never reconciles the iframe it swaps in.
      const el = document.createElement("div");
      host.appendChild(el);
      playerRef.current = new YTApi.Player(el, {
        width: "100%",
        height: "100%",
        playerVars: {
          controls: 0,
          disablekb: 1,
          playsinline: 1,
          rel: 0,
          fs: 0,
          iv_load_policy: 3,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            readyRef.current = true;
            setReady(true);
          },
          onStateChange: (e) => {
            const s = shownRef.current;
            setPlayerState(e.data);

            if (e.data === PLAYING) {
              setNeedsTap(false);
              if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
              if (s && !s.isPlaying) {
                // Started without anyone asking (e.g. a tap inside the video) → obey shared state.
                apply(s);
                return;
              }
              // After a load/seek settles, nudge into place once.
              if (resyncTimerRef.current) clearTimeout(resyncTimerRef.current);
              resyncTimerRef.current = setTimeout(() => apply(shownRef.current), 400);
            }

            if (e.data === ENDED && s?.isPlaying && s.videoId && s.videoId === loadedVideoRef.current) {
              // Both phones will call this — the RPC only advances once.
              void advanceFrom(s.videoId);
            }
          },
          onError: (e) => {
            const s = shownRef.current;
            // 101/150: owner blocked embedding. 100: removed. Skip it for both of us.
            if ([100, 101, 150].includes(e.data as number) && s?.videoId) {
              onErrorRef.current("That one can't play outside YouTube — skipping");
              setTimeout(() => void advanceFrom(s.videoId!), 1200);
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {}
      playerRef.current = null;
      readyRef.current = false;
      loadedVideoRef.current = null;
      host.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial state + clock sync on join.
  useEffect(() => {
    void syncClock().then(fetchState);
  }, [syncClock, fetchState]);

  // Once the player is ready (and unlocked), catch up to the shared state.
  useEffect(() => {
    if (ready && unlocked) apply(shownRef.current);
  }, [ready, unlocked, apply]);

  // Drift check every 5s while playing.
  useEffect(() => {
    const t = setInterval(() => {
      const s = shownRef.current;
      if (s?.isPlaying && !document.hidden) apply(s);
    }, DRIFT_CHECK_MS);
    return () => clearInterval(t);
  }, [apply]);

  // Phones sleep: when we come back, re-measure the clock and resync.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncClock().then(fetchState).then(() => apply(shownRef.current));
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [syncClock, fetchState, apply]);

  // ── Actions ────────────────────────────────────────────────────────
  const finishServerAction = useCallback(
    (data: unknown, error: { message: string } | null) => {
      if (error || !data) {
        onErrorRef.current(error?.message ?? "Couldn't sync that — try again");
        if (optimisticRef.current && serverStateRef.current) {
          optimisticRef.current = false;
          show(serverStateRef.current);
        }
        return;
      }
      const s = fromRow(data as PlaybackRow);
      if (acceptServer(s)) broadcastRef.current(s);
      else if (optimisticRef.current && serverStateRef.current) {
        // Someone pressed after us — their action wins.
        optimisticRef.current = false;
        show(serverStateRef.current);
      }
    },
    [acceptServer, show],
  );

  const commit = useCallback(
    async (patch: Partial<PlaybackState>) => {
      const cur = shownRef.current ?? EMPTY;
      const next: PlaybackState = { ...cur, ...patch, updatedAt: serverNow(), updatedBy: meId };
      // Apply immediately (and inside the tap, so the browser allows playback).
      optimisticRef.current = true;
      show(next);
      const { data, error } = await supabase.rpc("set_playback", {
        p_room: roomId,
        p_video_id: next.videoId,
        p_title: next.title,
        p_channel: next.channel,
        p_thumbnail: next.thumbnail,
        p_duration_sec: next.durationSec,
        p_added_by: next.addedBy,
        p_is_playing: next.isPlaying,
        p_position_sec: next.positionSec,
      });
      finishServerAction(data, error);
    },
    [supabase, roomId, meId, serverNow, show, finishServerAction],
  );

  const advanceFrom = useCallback(
    async (videoId: string) => {
      const { data, error } = await supabase.rpc("advance_queue", { p_room: roomId, p_from_video: videoId });
      finishServerAction(data, error);
    },
    [supabase, roomId, finishServerAction],
  );

  /** Best guess at where the song is right now, for UI. */
  const getPosition = useCallback(() => {
    const s = shownRef.current;
    const p = playerRef.current;
    if (!s?.videoId) return 0;
    if (p && readyRef.current && unlockedRef.current && loadedVideoRef.current === s.videoId) {
      const t = p.getCurrentTime?.();
      if (typeof t === "number" && t > 0) return t;
    }
    return expectedPosition(s, serverNow());
  }, [serverNow]);

  const playTrack = useCallback(
    (t: Track, addedBy: string = meId) =>
      commit({
        videoId: t.videoId,
        title: t.title,
        channel: t.channel,
        thumbnail: t.thumbnail,
        durationSec: t.durationSec,
        addedBy,
        isPlaying: true,
        positionSec: 0,
      }),
    [commit, meId],
  );

  const togglePlay = useCallback(() => {
    const s = shownRef.current;
    if (!s?.videoId) return;
    let pos = getPosition();
    if (!s.isPlaying && s.durationSec && pos >= s.durationSec - 1) pos = 0; // replay a finished song
    void commit({ isPlaying: !s.isPlaying, positionSec: pos });
  }, [commit, getPosition]);

  const seek = useCallback((sec: number) => void commit({ positionSec: Math.max(0, sec) }), [commit]);

  const skip = useCallback(() => {
    const s = shownRef.current;
    if (s?.videoId) void advanceFrom(s.videoId);
  }, [advanceFrom]);

  const playQueueItem = useCallback(
    async (itemId: string) => {
      optimisticRef.current = false;
      const { data, error } = await supabase.rpc("play_queue_item", { p_item: itemId });
      finishServerAction(data, error);
    },
    [supabase, finishServerAction],
  );

  /** Must be called from a tap: unlocks audio, then syncs to the room. */
  const unlock = useCallback(() => {
    const p = playerRef.current;
    unlockedRef.current = true;
    setUnlocked(true);
    if (!p || !readyRef.current) return;
    p.unMute();
    p.setVolume(100);
    loadedVideoRef.current = null; // force a fresh load inside this gesture
    apply(shownRef.current);
  }, [apply]);

  /** A remote state arrived (Broadcast or Postgres Changes). */
  const receive = useCallback((s: PlaybackState) => acceptServer(s), [acceptServer]);

  // Stable "listening now": buffering blips during seeks shouldn't flicker presence.
  const listening = unlocked && !!state?.isPlaying && !needsTap && playerState !== PAUSED && playerState !== ENDED;

  return {
    hostRef,
    state,
    ready,
    unlocked,
    needsTap,
    listening,
    playerState,
    unlock,
    receive,
    refetch: fetchState,
    getPosition,
    playTrack,
    togglePlay,
    seek,
    skip,
    playQueueItem,
  };
}
