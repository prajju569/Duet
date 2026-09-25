"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { usePlaybackSync } from "@/hooks/usePlaybackSync";
import { useWakeLock } from "@/hooks/useWakeLock";
import { DEFAULT_PALETTE, paletteForVideo, type Palette } from "@/lib/colors";
import { firstName, formatTime } from "@/lib/format";
import { fromRow, type PlaybackRow } from "@/lib/sync";
import type { Favourite, Member, Message, MessageMeta, PlaybackState, PresenceInfo, QueueItem, Reaction, Track } from "@/lib/types";
import { PlayerPanel } from "./PlayerPanel";
import { ChatPanel } from "./ChatPanel";
import { TopBar } from "./TopBar";
import { JoinOverlay } from "./JoinOverlay";
import { InviteSheet } from "./InviteSheet";
import { QuickLoginSetup } from "@/components/QuickLoginSetup";
import { RenameSheet } from "@/components/RoomsList";
import { useEmojiBurst } from "./EmojiBurst";
import { DedicateSheet } from "./DedicateSheet";
import type { RoomSong } from "./LibraryPanel";
import { sortQueue } from "@/lib/lyrics";
import { MILESTONE_HOURS, THEMES, togetherText } from "@/lib/themes";
import { ThemeSheet } from "./ThemeSheet";
import { ScheduleSheet } from "./ScheduleSheet";

export type ScheduledSong = { at: string; track: Track; by: string; label?: string };
import type { Features } from "@/lib/features";

type ConnectionView = "ok" | "offline" | "reconnecting" | "restored";

/**
 * Mobile networks drop constantly. Shows an honest status and, if the realtime
 * socket stays down while we're visible & online, rebuilds the channels.
 */
function useConnectionStatus(connected: boolean, rebuild: () => void): ConnectionView {
  const [online, setOnline] = useState(true);
  const [view, setView] = useState<ConnectionView>("ok");
  const wasDown = useRef(false);
  const rebuildRef = useRef(rebuild);
  useEffect(() => {
    rebuildRef.current = rebuild;
  });

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    if (!online) {
      wasDown.current = true;
      setView("offline");
      return;
    }
    if (connected) {
      if (!wasDown.current) return setView("ok");
      wasDown.current = false;
      setView("restored");
      const t = setTimeout(() => setView("ok"), 1800);
      return () => clearTimeout(t);
    }
    // Disconnected but online: brief grace period (initial connect, quick blips) before showing anything.
    const show = setTimeout(() => {
      wasDown.current = true;
      setView("reconnecting");
    }, 2500);
    // Still down after 8s → rebuild channels (the socket may be dead after the phone slept).
    const kick = setInterval(() => {
      if (document.visibilityState === "visible") rebuildRef.current();
    }, 8000);
    return () => {
      clearTimeout(show);
      clearInterval(kick);
    };
  }, [online, connected]);

  // Coming back to the app with a dead connection: rebuild right away.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine && !connected) rebuildRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [connected]);

  return view;
}

function ConnectionBanner({ view }: { view: ConnectionView }) {
  if (view === "ok") return null;
  const styles = {
    offline: "bg-amber-300 text-ink",
    reconnecting: "bg-zinc-900/90 text-cream ring-1 ring-white/15",
    restored: "bg-emerald-300 text-ink",
  }[view];
  const text = {
    offline: "You're offline — messages will fail until you're back",
    reconnecting: "Reconnecting…",
    restored: "Back online ✓",
  }[view];
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(max(env(safe-area-inset-top),8px)+52px)] z-[45] flex justify-center px-4">
      <div className={`animate-rise flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium shadow-lg backdrop-blur ${styles}`}>
        {view === "reconnecting" && <span className="size-3 animate-spin rounded-full border-2 border-cream/30 border-t-cream" />}
        {text}
      </div>
    </div>
  );
}

type Props = {
  room: {
    id: string;
    code: string;
    name: string;
    autoplay?: boolean;
    listenedSeconds?: number;
    theme?: string | null;
    scheduled?: ScheduledSong | null;
  };
  me: { id: string; name: string; username: string | null };
  initialMembers: Member[];
  /** Open the invite sheet right away (just created the room). */
  openInvite?: boolean;
  /** Which database-backed features are available. */
  features?: Features;
  /** Server-rendered first screen, so the room opens already filled in. */
  initial: {
    messages: Message[];
    hasOlder: boolean;
    reactions: Reaction[];
    queue: QueueItem[];
    favourites: Favourite[];
    playback: PlaybackRow | null;
  };
};

const reactionMap = (rows: Reaction[]) =>
  Object.fromEntries(rows.map((r) => [`${r.message_id}:${r.user_id}`, r])) as Record<string, Reaction>;

const PAGE = 60;

export function RoomClient({ room, me, initialMembers, initial, openInvite = false, features = { v2: false } }: Props) {
  const supabase = getSupabase();
  const roomChannelRef = useRef<RealtimeChannel | null>(null);
  const teardownRef = useRef<Promise<void>>(Promise.resolve());

  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [messages, setMessages] = useState<Message[]>(initial.messages);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [hasOlder, setHasOlder] = useState(initial.hasOlder);
  const [reactions, setReactions] = useState<Record<string, Reaction>>(() => reactionMap(initial.reactions)); // key: message_id:user_id
  const [queue, setQueue] = useState<QueueItem[]>(() => sortQueue(initial.queue));
  const [ourSongs, setOurSongs] = useState<RoomSong[]>([]);
  const [autoplay, setAutoplay] = useState(room.autoplay ?? true);
  const [theme, setTheme] = useState<string | null>(room.theme ?? null);
  const [listened, setListened] = useState(room.listenedSeconds ?? 0);
  const [scheduled, setScheduled] = useState<ScheduledSong | null>(room.scheduled ?? null);
  const [sheet, setSheet] = useState<"theme" | "schedule" | null>(null);
  const [favourites, setFavourites] = useState<Favourite[]>(initial.favourites);
  const [presence, setPresence] = useState<Record<string, PresenceInfo>>({});
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [palette, setPalette] = useState<Palette>(DEFAULT_PALETTE);
  const [connected, setConnected] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(openInvite);
  const [roomName, setRoomName] = useState(room.name);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState(room.name);
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameErr, setRenameErr] = useState<string | null>(null);
  const [username, setUsername] = useState(me.username);
  const [pinSheet, setPinSheet] = useState(false);
  const [pinNudgeDismissed, setPinNudgeDismissed] = useState(false);
  const [channelKey, setChannelKey] = useState(0); // bump to tear down & rebuild realtime channels
  const connection = useConnectionStatus(connected, () => setChannelKey((k) => k + 1));
  const [joinTick, setJoinTick] = useState(0); // bumps on every (re)join of the room channel
  const trackedRef = useRef<boolean | null>(null);

  const nameOf = useCallback(
    (userId: string | null | undefined) => {
      if (!userId) return "Someone";
      if (userId === me.id) return firstName(me.name);
      return firstName(members.find((m) => m.userId === userId)?.name);
    },
    [members, me],
  );
  const partner = members.find((m) => m.userId !== me.id) ?? null;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500);
  }, []);

  const broadcastPlayback = useCallback((s: PlaybackState) => {
    void roomChannelRef.current?.send({ type: "broadcast", event: "playback", payload: s });
  }, []);

  const burst = useEmojiBurst();
  const lastBurst = useRef(0);
  const sendBurst = useCallback(
    (emoji: string) => {
      const now = Date.now();
      if (now - lastBurst.current < 350) return;
      lastBurst.current = now;
      burst.fire(emoji);
      void roomChannelRef.current?.send({ type: "broadcast", event: "burst", payload: { emoji } });
    },
    [burst],
  );
  const lastNudge = useRef(0);
  const sendNudge = useCallback(() => {
    const now = Date.now();
    if (now - lastNudge.current < 10_000) return showToast("Sent — give it a moment 💭");
    lastNudge.current = now;
    void roomChannelRef.current?.send({ type: "broadcast", event: "nudge", payload: { from: me.name } });
    burst.fire("💭");
    showToast("💭 Sent");
    void fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: room.id, kind: "nudge" }),
    }).catch(() => {});
  }, [burst, me.name, room.id, showToast]);
  const burstRef = useRef(burst.fire);
  useEffect(() => {
    burstRef.current = burst.fire;
  });

  const player = usePlaybackSync({
    roomId: room.id,
    meId: me.id,
    initial: initial.playback ? fromRow(initial.playback) : null,
    broadcast: broadcastPlayback,
    onError: showToast,
  });
  useWakeLock(player.unlocked && !!player.state?.isPlaying);

  // ── Data loading ───────────────────────────────────────────────────
  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("room_id", room.id)
      .order("created_at", { ascending: false })
      .limit(PAGE);
    const rows = ((data ?? []) as Message[]).reverse();
    setHasOlder((data ?? []).length === PAGE);
    setMessages((prev) => {
      // keep any optimistic messages still in flight
      const pending = prev.filter((m) => m.pending && !rows.some((r) => r.id === m.id));
      return [...rows, ...pending];
    });
    if (rows.length) {
      const { data: rx } = await supabase
        .from("message_reactions")
        .select("*")
        .eq("room_id", room.id)
        .in("message_id", rows.map((r) => r.id));
      setReactions((prev) => {
        const next = { ...prev };
        for (const r of (rx ?? []) as Reaction[]) next[`${r.message_id}:${r.user_id}`] = r;
        return next;
      });
    }
  }, [supabase, room.id]);

  /** Messages that arrived after the server render (merged, no reload of the whole list). */
  const loadMessagesSince = useCallback(async () => {
    const newest = [...messagesRef.current].reverse().find((m) => !m.pending);
    let q = supabase.from("messages").select("*").eq("room_id", room.id).order("created_at");
    if (newest) q = q.gt("created_at", newest.created_at);
    const { data } = await q.limit(200);
    const rows = (data ?? []) as Message[];
    if (!rows.length) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      return [...prev, ...rows.filter((r) => !seen.has(r.id))];
    });
  }, [supabase, room.id]);

  const loadOlder = useCallback(async () => {
    const oldest = messages.find((m) => !m.pending);
    if (!oldest) return;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("room_id", room.id)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(PAGE);
    const rows = ((data ?? []) as Message[]).reverse();
    setHasOlder(rows.length === PAGE);
    setMessages((prev) => [...rows, ...prev]);
    if (rows.length) {
      const { data: rx } = await supabase.from("message_reactions").select("*").in("message_id", rows.map((r) => r.id));
      setReactions((prev) => {
        const next = { ...prev };
        for (const r of (rx ?? []) as Reaction[]) next[`${r.message_id}:${r.user_id}`] = r;
        return next;
      });
    }
  }, [supabase, room.id, messages]);

  const loadQueue = useCallback(async () => {
    const { data } = await supabase
      .from("queue_items")
      .select("*")
      .eq("room_id", room.id)
      .eq("status", "queued")
      .order("created_at");
    setQueue(sortQueue((data ?? []) as QueueItem[]));
  }, [supabase, room.id]);

  const loadMembers = useCallback(async () => {
    const { data: rows } = await supabase.from("room_members").select("user_id, last_read_at").eq("room_id", room.id);
    const ids = (rows ?? []).map((r) => r.user_id as string);
    const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
    setMembers(
      (rows ?? []).map((r) => ({
        userId: r.user_id as string,
        lastReadAt: r.last_read_at as string,
        name: (profs ?? []).find((p) => p.id === r.user_id)?.display_name ?? "Someone",
      })),
    );
  }, [supabase, room.id]);

  // (No initial client fetch: the server already sent messages, queue & favourites.
  //  loadMessages / loadQueue run again only after a reconnect, to fill gaps.)

  // ── Realtime ───────────────────────────────────────────────────────
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const receiveRef = useRef(player.receive);
  const refetchRef = useRef(player.refetch);
  useEffect(() => {
    receiveRef.current = player.receive;
    refetchRef.current = player.refetch;
  });

  useEffect(() => {
    let alive = true;
    let dbChannel: RealtimeChannel | null = null;
    let roomChannel: RealtimeChannel | null = null;
    // After a forced rebuild, the first SUBSCRIBED is a *re*connect → refetch what we missed.
    let subscribedOnce = channelKey > 0;

    (async () => {
      // supabase.channel() hands back an existing channel with the same topic, so wait
      // until the previous (re)build has fully left before creating fresh ones.
      await teardownRef.current;
      await supabase.realtime.setAuth();
      if (!alive) return;

      // Private Broadcast + Presence channel — RLS on realtime.messages limits it to members.
      roomChannel = supabase.channel(`room:${room.id}`, {
        config: { private: true, broadcast: { self: false }, presence: { key: me.id } },
      });
      roomChannelRef.current = roomChannel;

      roomChannel
        .on("broadcast", { event: "playback" }, ({ payload }) => receiveRef.current(payload as PlaybackState))
        .on("broadcast", { event: "burst" }, ({ payload }) => {
          if (typeof payload?.emoji === "string") burstRef.current(payload.emoji.slice(0, 8));
        })
        .on("broadcast", { event: "nudge" }, ({ payload }) => {
          navigator.vibrate?.([30, 60, 30]);
          burstRef.current("💗");
          setToast(`💭 ${firstName(String(payload?.from ?? "They"))} is thinking of you`);
          setTimeout(() => setToast(null), 4000);
        })
        .on("broadcast", { event: "room-renamed" }, ({ payload }) => {
          if (typeof payload?.name === "string") setRoomName(payload.name);
        })
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          if (payload?.userId === me.id) return;
          setPartnerTyping(!!payload?.typing);
          if (typingTimer.current) clearTimeout(typingTimer.current);
          if (payload?.typing) typingTimer.current = setTimeout(() => setPartnerTyping(false), 4000);
        })
        .on("presence", { event: "sync" }, () => {
          const st = roomChannel!.presenceState<PresenceInfo>();
          const next: Record<string, PresenceInfo> = {};
          for (const [key, metas] of Object.entries(st)) {
            const last = metas[metas.length - 1];
            if (last) next[key] = { userId: key, name: last.name, listening: metas.some((m) => m.listening) };
          }
          setPresence(next);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            trackedRef.current = null; // presence must be re-tracked after every (re)join
            setConnected(true);
            setJoinTick((t) => t + 1);
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setConnected(false);
          }
        });

      // Postgres Changes: chat, reactions, queue, read receipts, playback (backup path).
      const filter = `room_id=eq.${room.id}`;
      dbChannel = supabase
        // wait: only report SUBSCRIBED once the database listener is really live, so the
        // catch-up fetch below can't race a change that lands in between.
        .channel(`db:${room.id}`, { config: { postgres_changes_options: { wait: true } } })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter }, ({ new: row }) => {
          const m = row as Message;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev.map((x) => (x.id === m.id ? m : x)) : [...prev, m]));
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter }, ({ new: row }) => {
          const m = row as Message;
          if (m?.id) setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m, pending: false } : x)));
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions", filter }, ({ new: row }) => {
          const r = row as Reaction;
          if (r?.message_id) setReactions((prev) => ({ ...prev, [`${r.message_id}:${r.user_id}`]: r }));
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "queue_items", filter }, ({ new: row }) => {
          const q = row as QueueItem;
          if (!q?.id) return;
          setQueue((prev) => {
            const rest = prev.filter((x) => x.id !== q.id);
            return q.status === "queued" ? sortQueue([...rest, q]) : rest;
          });
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "room_members", filter }, ({ eventType, new: row }) => {
          if (eventType === "INSERT") return void loadMembers();
          const r = row as { user_id: string; last_read_at: string };
          if (r?.user_id) setMembers((prev) => prev.map((m) => (m.userId === r.user_id ? { ...m, lastReadAt: r.last_read_at } : m)));
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "playback_state", filter }, ({ new: row }) => {
          if (row && "room_id" in row) {
            receiveRef.current(fromRow(row as PlaybackRow));
          }
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            // Fill anything that changed while we weren't listening — the gap between the
            // server render and this subscription, or the time we were disconnected.
            void loadMembers();
            void loadQueue();
            void refetchRef.current();
            if (subscribedOnce) void loadMessages();
            else void loadMessagesSince();
            subscribedOnce = true;
          }
        });
    })();

    return () => {
      alive = false;
      roomChannelRef.current = null;
      setConnected(false);
      teardownRef.current = Promise.all([
        roomChannel && supabase.removeChannel(roomChannel),
        dbChannel && supabase.removeChannel(dbChannel),
      ]).then(() => undefined);
    };
  }, [supabase, room.id, me.id, me.name, loadMessages, loadMessagesSince, loadQueue, loadMembers, channelKey]);

  // ── Music extras (v2) ──────────────────────────────────────────────
  const loadOurSongs = useCallback(async () => {
    if (!features.v2) return;
    const { data } = await supabase.from("room_songs").select("*").eq("room_id", room.id).order("created_at", { ascending: false });
    setOurSongs((data ?? []) as RoomSong[]);
  }, [supabase, room.id, features.v2]);

  useEffect(() => {
    if (!features.v2) return;
    void loadOurSongs();
    const ch = supabase
      .channel(`songs:${room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_songs", filter: `room_id=eq.${room.id}` }, () => void loadOurSongs())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, room.id, features.v2, loadOurSongs]);

  const saveOurSong = useCallback(
    async (t: Track) => {
      const { error } = await supabase.from("room_songs").insert({
        room_id: room.id,
        video_id: t.videoId,
        title: t.title,
        channel: t.channel,
        thumbnail: t.thumbnail,
        duration_sec: t.durationSec,
        added_by: me.id,
      });
      if (error && error.code !== "23505") return showToast("Couldn't save that");
      showToast("Saved to Our Songs 🎶");
      void loadOurSongs();
    },
    [supabase, room.id, me.id, showToast, loadOurSongs],
  );

  const removeOurSong = useCallback(
    async (id: string) => {
      setOurSongs((prev) => prev.filter((s) => s.id !== id));
      await supabase.from("room_songs").delete().eq("id", id);
    },
    [supabase],
  );

  const reorderQueue = useCallback(
    async (ids: string[]) => {
      setQueue((prev) => ids.map((id, i) => ({ ...prev.find((q) => q.id === id)!, position: i + 1 })).filter((q) => q.id));
      const { error } = await supabase.rpc("reorder_queue", { p_room: room.id, p_ids: ids });
      if (error) {
        showToast("Couldn't reorder");
        void loadQueue();
      }
    },
    [supabase, room.id, showToast, loadQueue],
  );

  const changeAutoplay = useCallback(
    async (on: boolean) => {
      setAutoplay(on);
      const { error } = await supabase.rpc("update_room_settings", { p_room: room.id, p_settings: { autoplay: on } });
      if (error) setAutoplay(!on);
    },
    [supabase, room.id],
  );

  // ── Us layer (v2) ──────────────────────────────────────────────────
  const scheduleOptions = useMemo(() => {
    const out: Track[] = [];
    const add = (t: Track) => !out.some((x) => x.videoId === t.videoId) && out.push(t);
    const s = player.state;
    if (s?.videoId) add({ videoId: s.videoId, title: s.title ?? "", channel: s.channel, thumbnail: s.thumbnail, durationSec: s.durationSec });
    ourSongs.forEach((o) => add({ videoId: o.video_id, title: o.title, channel: o.channel, thumbnail: o.thumbnail, durationSec: o.duration_sec }));
    favourites.forEach((f) => add({ videoId: f.video_id, title: f.title, channel: f.channel, thumbnail: f.thumbnail, durationSec: f.duration_sec }));
    return out.slice(0, 40);
  }, [player.state, ourSongs, favourites]);

  // Listening-together counter: while you're BOTH listening, one phone (the lower
  // user id) adds 30 s every 30 s. The other phone hears about it via Realtime.
  const bothListening = !!partner && player.listening && !!presence[partner.userId]?.listening;
  const reporter = !!partner && me.id < partner.userId;
  useEffect(() => {
    if (!features.v2 || !bothListening || !reporter) return;
    const t = setInterval(async () => {
      const { data } = await supabase.rpc("add_listen_time", { p_room: room.id, p_seconds: 30 });
      if (typeof data === "number") setListened((prev) => Math.max(prev, data));
    }, 30_000);
    return () => clearInterval(t);
  }, [features.v2, bothListening, reporter, supabase, room.id]);

  const lastMilestone = useRef<number | null>(null);
  useEffect(() => {
    const hours = Math.floor(listened / 3600);
    const reached = MILESTONE_HOURS.filter((h) => h <= hours).pop() ?? 0;
    if (lastMilestone.current === null) {
      lastMilestone.current = reached; // don't celebrate on page load
      return;
    }
    if (reached > lastMilestone.current) {
      lastMilestone.current = reached;
      burstRef.current("🎉");
      showToast(`🎉 ${reached} ${reached === 1 ? "hour" : "hours"} of listening together!`);
    }
  }, [listened, showToast]);

  // Scheduled song: when the time comes, whichever phone is open starts it (once).
  const firing = useRef(false);
  useEffect(() => {
    if (!features.v2 || !scheduled) return;
    const ms = new Date(scheduled.at).getTime() - Date.now();
    if (ms > 24 * 3600 * 1000) return;
    const fire = async () => {
      if (firing.current) return;
      firing.current = true;
      const { data, error } = await supabase.rpc("fire_scheduled_song", { p_room: room.id });
      firing.current = false;
      setScheduled(null);
      if (!error && data) {
        const st = fromRow(data as PlaybackRow);
        if (player.receive(st)) broadcastPlayback(st);
      }
    };
    const t = setTimeout(fire, Math.max(0, ms));
    return () => clearTimeout(t);
  }, [features.v2, scheduled, supabase, room.id, player, broadcastPlayback]);

  const cancelSchedule = useCallback(async () => {
    setScheduled(null);
    await supabase.rpc("update_room_settings", { p_room: room.id, p_settings: { scheduled: null } });
  }, [supabase, room.id]);

  // Room renamed elsewhere (e.g. from the home screen). Its own channel, so if the rooms
  // table isn't enabled for Realtime yet, chat and sync are unaffected.
  useEffect(() => {
    const ch = supabase
      .channel(`roomname:${room.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${room.id}` }, ({ new: row }) => {
        const r = row as { name?: string; autoplay?: boolean; theme?: string | null; listened_seconds?: number; scheduled?: ScheduledSong | null };
        if (r.name) setRoomName(r.name);
        if (typeof r.autoplay === "boolean") setAutoplay(r.autoplay);
        if ("theme" in r) setTheme(r.theme ?? null);
        if (typeof r.listened_seconds === "number") setListened((prev) => Math.max(prev, Number(r.listened_seconds)));
        if ("scheduled" in r) setScheduled(r.scheduled ?? null);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, room.id]);

  // Keep presence "listening now" fresh — debounced, since Realtime rate-limits presence updates.
  useEffect(() => {
    if (!connected) return;
    const t = setTimeout(() => {
      if (trackedRef.current === player.listening) return;
      trackedRef.current = player.listening;
      void roomChannelRef.current?.track({ userId: me.id, name: me.name, listening: player.listening });
    }, trackedRef.current === null ? 0 : 800);
    return () => clearTimeout(t);
  }, [player.listening, connected, joinTick, me.id, me.name]);

  // Background gradient follows the song.
  useEffect(() => {
    const vid = player.state?.videoId;
    if (!vid) return;
    let alive = true;
    paletteForVideo(vid)
      .then((p) => alive && setPalette(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [player.state?.videoId]);

  // ── Chat actions ───────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (body: string, replyTo: string | null = null, extra?: { kind: Message["kind"]; meta: MessageMeta }) => {
      const text = body.trim();
      if (!text) return;
      const msg: Message = {
        id: crypto.randomUUID(),
        room_id: room.id,
        user_id: me.id,
        kind: extra?.kind ?? "text",
        meta: extra?.meta ?? null,
        body: text,
        created_at: new Date().toISOString(),
        reply_to: replyTo,
        pending: true,
      };
      setMessages((prev) => [...prev, msg]);
      const { data, error } = await supabase
        .from("messages")
        // reply_to only sent when replying, so plain messages work even before the reply migration.
        .insert({
          id: msg.id,
          room_id: room.id,
          user_id: me.id,
          body: text,
          ...(replyTo ? { reply_to: replyTo } : {}),
          ...(extra ? { kind: extra.kind, meta: extra.meta } : {}),
        })
        .select()
        .single();
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? (error ? { ...m, pending: false, failed: true } : (data as Message)) : m)),
      );
      if (error) showToast(replyTo && /reply_to/.test(error.message) ? "Replies need the new database update (see README)" : "Message didn't send");
    },
    [supabase, room.id, me.id, showToast],
  );

  // ── v2 chat extras ─────────────────────────────────────────────────
  const replaceMessage = useCallback((m: Message) => setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x))), []);

  const editMessage = useCallback(
    async (id: string, body: string) => {
      const text = body.trim();
      if (!text) return;
      setMessages((prev) => prev.map((x) => (x.id === id ? { ...x, body: text, edited_at: new Date().toISOString() } : x)));
      const { data, error } = await supabase.rpc("edit_message", { p_id: id, p_body: text });
      if (error) {
        showToast(error.message.includes("TOO_OLD") ? "Messages can only be edited for 24 hours" : "Couldn't edit that");
        return void loadMessages();
      }
      replaceMessage(data as Message);
    },
    [supabase, showToast, replaceMessage, loadMessages],
  );

  const unsendMessage = useCallback(
    async (id: string) => {
      setMessages((prev) => prev.map((x) => (x.id === id ? { ...x, body: "Message deleted", meta: null, deleted_at: new Date().toISOString() } : x)));
      const { data, error } = await supabase.rpc("delete_message", { p_id: id });
      if (error) {
        showToast("Couldn't unsend that");
        return void loadMessages();
      }
      replaceMessage(data as Message);
    },
    [supabase, showToast, replaceMessage, loadMessages],
  );

  const sendSticker = useCallback((emoji: string) => sendMessage(emoji, null, { kind: "sticker", meta: { sticker: emoji } }), [sendMessage]);

  const shareMoment = useCallback(() => {
    const s = player.state;
    if (!s?.videoId) return;
    const at = Math.floor(player.getPosition());
    void sendMessage(`🎵 ${s.title ?? "This song"} · ${formatTime(at)}`, null, {
      kind: "moment",
      meta: { videoId: s.videoId, title: s.title ?? "", channel: s.channel, thumbnail: s.thumbnail, durationSec: s.durationSec, at },
    });
    showToast("Moment shared in chat 💬");
  }, [player, sendMessage, showToast]);

  const [dedicating, setDedicating] = useState<Track | null>(null);
  const sendDedication = useCallback(
    (t: Track, note: string) => {
      void sendMessage(`💌 ${t.title}`, null, {
        kind: "dedication",
        meta: { videoId: t.videoId, title: t.title, channel: t.channel, thumbnail: t.thumbnail, durationSec: t.durationSec, note: note.trim().slice(0, 280) },
      });
      setDedicating(null);
    },
    [sendMessage],
  );

  /** ▶ on a moment / dedication card: play that song for both of you. */
  const playFromMessage = useCallback(
    (m: Message) => {
      const meta = m.meta;
      if (!meta?.videoId) return;
      const track: Track = {
        videoId: meta.videoId,
        title: meta.title ?? "",
        channel: meta.channel ?? null,
        thumbnail: meta.thumbnail ?? null,
        durationSec: meta.durationSec ?? null,
      };
      const at = m.kind === "moment" ? (meta.at ?? 0) : 0;
      if (player.state?.videoId === meta.videoId && m.kind === "moment") return player.seek(at);
      void player.playTrack(track, m.user_id ?? me.id, at);
    },
    [player, me.id],
  );

  const lastTypingSent = useRef(0);
  const sendTyping = useCallback(
    (typing: boolean) => {
      const now = Date.now();
      if (typing && now - lastTypingSent.current < 1500) return;
      lastTypingSent.current = typing ? now : 0;
      void roomChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { userId: me.id, typing } });
    },
    [me.id],
  );

  const react = useCallback(
    async (messageId: string, emoji: string) => {
      const key = `${messageId}:${me.id}`;
      const current = reactions[key]?.emoji ?? null;
      const nextEmoji = current === emoji ? null : emoji; // tap the same emoji again to remove
      const row: Reaction = { message_id: messageId, user_id: me.id, room_id: room.id, emoji: nextEmoji };
      setReactions((prev) => ({ ...prev, [key]: row }));
      const { error } = await supabase
        .from("message_reactions")
        .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "message_id,user_id" });
      if (error) showToast("Couldn't react");
    },
    [supabase, reactions, me.id, room.id, showToast],
  );

  const lastMarked = useRef(0);
  const markRead = useCallback(() => {
    if (document.hidden) return;
    const now = Date.now();
    if (now - lastMarked.current < 1500) return;
    lastMarked.current = now;
    // Query builders are lazy — they only run once awaited / then-ed.
    void supabase.rpc("mark_read", { p_room: room.id }).then(() => {});
  }, [supabase, room.id]);

  // ── Queue & favourites ─────────────────────────────────────────────
  const addToQueue = useCallback(
    async (t: Track) => {
      const { error } = await supabase.from("queue_items").insert({
        room_id: room.id,
        video_id: t.videoId,
        title: t.title,
        channel: t.channel,
        thumbnail: t.thumbnail,
        duration_sec: t.durationSec,
        added_by: me.id,
      });
      showToast(error ? "Couldn't add to queue" : `Added “${t.title}”`);
    },
    [supabase, room.id, me.id, showToast],
  );

  const removeFromQueue = useCallback(
    async (id: string) => {
      setQueue((prev) => prev.filter((q) => q.id !== id));
      await supabase.from("queue_items").update({ status: "removed" }).eq("id", id);
    },
    [supabase],
  );

  const isFavourite = useCallback((videoId: string | null | undefined) => favourites.some((f) => f.video_id === videoId), [favourites]);

  const toggleFavourite = useCallback(
    async (t: Track) => {
      const existing = favourites.find((f) => f.video_id === t.videoId);
      if (existing) {
        setFavourites((prev) => prev.filter((f) => f.id !== existing.id));
        await supabase.from("favourites").delete().eq("id", existing.id);
        return;
      }
      const { data, error } = await supabase
        .from("favourites")
        .insert({
          user_id: me.id,
          video_id: t.videoId,
          title: t.title,
          channel: t.channel,
          thumbnail: t.thumbnail,
          duration_sec: t.durationSec,
        })
        .select()
        .single();
      if (error) return showToast("Couldn't save favourite");
      setFavourites((prev) => [data as Favourite, ...prev]);
      showToast("Saved to your favourites ♥");
    },
    [supabase, favourites, me.id, showToast],
  );

  const shown = (theme && THEMES[theme]?.palette) || palette;
  const style = useMemo(
    () => ({ "--c1": shown.c1, "--c2": shown.c2, "--c3": shown.c3 }) as React.CSSProperties,
    [shown],
  );

  const topBar = (
    <TopBar
      roomName={roomName}
      onNudge={sendNudge}
      onTheme={features.v2 ? () => setSheet("theme") : undefined}
      onSchedule={features.v2 ? () => setSheet("schedule") : undefined}
      togetherText={features.v2 && listened >= 60 ? togetherText(listened) : null}
      onRename={() => {
        setRenameDraft(roomName);
        setRenameErr(null);
        setRenameOpen(true);
      }}
      code={room.code}
      me={me}
      partner={partner}
      presence={presence}
      onInvite={() => setInviteOpen(true)}
    />
  );

  return (
    <div className="duet-bg vv-fixed overflow-hidden overscroll-none text-cream" style={style} data-playing={player.state?.isPlaying ? "" : undefined}>
      <div className="relative z-10 flex h-full flex-col lg:flex-row">
        <div className="lg:hidden">{topBar}</div>
        <PlayerPanel
          roomName={roomName}
          roomId={room.id}
          ourSongs={ourSongs}
          onSaveOurSong={features.v2 ? saveOurSong : undefined}
          onRemoveOurSong={removeOurSong}
          onReorder={reorderQueue}
          autoplay={autoplay}
          onAutoplay={changeAutoplay}
          v2={features.v2}
          onShareMoment={shareMoment}
          onDedicate={partner ? setDedicating : undefined}
          player={player}
          queue={queue}
          favourites={favourites}
          nameOf={nameOf}
          meId={me.id}
          isFavourite={isFavourite}
          onToggleFavourite={toggleFavourite}
          onAddToQueue={addToQueue}
          onRemoveFromQueue={removeFromQueue}
          onError={showToast}
        />
        <ChatPanel
          topBar={<div className="hidden lg:block">{topBar}</div>}
          meId={me.id}
          partner={partner}
          messages={messages}
          reactions={reactions}
          hasOlder={hasOlder}
          onLoadOlder={loadOlder}
          partnerTyping={partnerTyping}
          nameOf={nameOf}
          onSend={sendMessage}
          onTyping={sendTyping}
          onBurst={sendBurst}
          v2={features.v2}
          onEdit={editMessage}
          onUnsend={unsendMessage}
          onSticker={sendSticker}
          onPlayFromMessage={playFromMessage}
          onReact={react}
          onSeen={markRead}
          notice={
            scheduled && features.v2 ? (
              <div className="animate-rise mb-2 flex items-center gap-3 rounded-2xl bg-zinc-900/90 p-2.5 pl-3.5 ring-1 ring-white/10 backdrop-blur">
                <span className="text-lg">⏰</span>
                <div className="min-w-0 flex-1 text-sm leading-snug">
                  <b>{scheduled.label ?? "Scheduled"}</b>
                  <span className="text-cream/60">
                    {" · "}
                    {new Date(scheduled.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} — {scheduled.track.title}
                  </span>
                </div>
                <button onClick={cancelSchedule} className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs">
                  Cancel
                </button>
              </div>
            ) : // People who joined by invite can't log in elsewhere until they pick a PIN.
            !username && !pinNudgeDismissed && player.unlocked ? (
              <div className="animate-rise mb-2 flex items-center gap-3 rounded-2xl bg-zinc-900/90 p-2.5 pl-3.5 ring-1 ring-white/10 backdrop-blur">
                <span className="text-lg">🔐</span>
                <div className="min-w-0 flex-1 text-sm leading-snug">
                  <b>Save your login</b>
                  <span className="text-cream/60"> — pick a PIN to open Duet on any phone.</span>
                </div>
                <button onClick={() => setPinSheet(true)} className="shrink-0 rounded-full bg-cream px-3 py-1.5 text-sm font-semibold text-ink">
                  Set PIN
                </button>
                <button onClick={() => setPinNudgeDismissed(true)} aria-label="Later" className="shrink-0 p-1 text-cream/50">
                  ✕
                </button>
              </div>
            ) : null
          }
        />
      </div>

      {!player.unlocked && (
        <JoinOverlay
          ready={player.ready}
          state={player.state}
          partnerName={partner ? firstName(partner.name) : null}
          partnerListening={!!(partner && presence[partner.userId]?.listening)}
          onJoin={player.unlock}
        />
      )}

      <ConnectionBanner view={connection} />
      {sheet === "theme" && (
        <ThemeSheet
          current={theme}
          onClose={() => setSheet(null)}
          onPick={async (id) => {
            setTheme(id);
            await supabase.rpc("update_room_settings", { p_room: room.id, p_settings: { theme: id } });
          }}
        />
      )}
      {sheet === "schedule" && (
        <ScheduleSheet
          options={scheduleOptions}
          onClose={() => setSheet(null)}
          onSave={async (at, track, label) => {
            const s: ScheduledSong = { at: at.toISOString(), track, by: me.id, label };
            setScheduled(s);
            setSheet(null);
            const { error } = await supabase.rpc("update_room_settings", { p_room: room.id, p_settings: { scheduled: s } });
            if (error) {
              setScheduled(null);
              return showToast("Couldn't schedule that");
            }
            showToast(`⏰ Scheduled for ${at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`);
          }}
        />
      )}
      {dedicating && partner && (
        <DedicateSheet
          track={dedicating}
          partnerName={firstName(partner.name)}
          onClose={() => setDedicating(null)}
          onSend={(note) => sendDedication(dedicating, note)}
        />
      )}
      {burst.layer}

      {renameOpen && (
        <RenameSheet
          value={renameDraft}
          onChange={setRenameDraft}
          busy={renameBusy}
          error={renameErr}
          onClose={() => setRenameOpen(false)}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!renameDraft.trim()) return;
            setRenameBusy(true);
            setRenameErr(null);
            const { data, error } = await supabase.rpc("rename_room", { p_room: room.id, p_name: renameDraft });
            setRenameBusy(false);
            if (error) return setRenameErr("Couldn't rename — try again.");
            setRoomName(data as string);
            setRenameOpen(false);
            // Tell the other phone right away (the database change is the backup path).
            void roomChannelRef.current?.send({ type: "broadcast", event: "room-renamed", payload: { name: data } });
          }}
        />
      )}

      {inviteOpen && !partner && <InviteSheet roomId={room.id} myName={me.name} onClose={() => setInviteOpen(false)} />}

      {pinSheet && (
        <div className="vv-fixed z-[55] flex items-end justify-center bg-black/60 px-3 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur-sm sm:items-center" onClick={() => setPinSheet(false)}>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <QuickLoginSetup
              suggested={me.name.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 20)}
              existingUsername={null}
              onDone={(u) => {
                setUsername(u);
                setPinSheet(false);
                showToast(`Saved — log in anywhere as ${u} + your PIN`);
              }}
              onSkip={() => setPinSheet(false)}
            />
          </div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
          <div className="animate-rise rounded-full bg-black/70 px-4 py-2 text-sm text-cream shadow-lg backdrop-blur">{toast}</div>
        </div>
      )}
    </div>
  );
}
