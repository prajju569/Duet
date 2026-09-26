"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBackToClose } from "@/lib/backStack";
import { useRouter } from "next/navigation";
import { confirmAndDeleteRoom } from "@/lib/deleteRoom";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { usePlaybackSync } from "@/hooks/usePlaybackSync";
import { useWakeLock } from "@/hooks/useWakeLock";
import { DEFAULT_PALETTE, paletteForVideo, type Palette } from "@/lib/colors";
import { firstName, formatTime } from "@/lib/format";
import { fromRow, type PlaybackRow } from "@/lib/sync";
import type { Countdown, Favourite, Member, Message, MessageMeta, PlaybackState, PollVote, PresenceInfo, QueueItem, Reaction, Track } from "@/lib/types";
import { PlayerPanel } from "./PlayerPanel";
import { ChatPanel } from "./ChatPanel";
import { TopBar } from "./TopBar";
import { JoinOverlay } from "./JoinOverlay";
import { InviteSheet } from "./InviteSheet";
import { QuickLoginSetup } from "@/components/QuickLoginSetup";
import { ChatSearch } from "./ChatSearch";
import { PollSheet } from "./PollSheet";
import { CountdownSheet, daysUntil } from "./CountdownSheet";
import { PlayRequestCard, REQUEST_SECONDS } from "./PlayRequestCard";
import { GameSheet, newGameState, turnOf } from "@/components/games/GameSheet";
import { GamesList } from "./LibraryPanel";
import { gameInfo, type GameKind, type GameRow } from "@/lib/games/types";
import { questionOfTheDay } from "@/lib/questions";
import { updateAppBadge } from "@/lib/badge";
import { RenameSheet } from "@/components/RoomsList";
import { useEmojiBurst } from "./EmojiBurst";
import { DedicateSheet } from "./DedicateSheet";
import type { RoomSong } from "./LibraryPanel";
import { sortQueue } from "@/lib/lyrics";
import { MEDIA_BUCKET, downscaleImage, extFor } from "@/lib/media";
import { usePush } from "@/hooks/usePush";
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
    countdown?: Countdown | null;
    pinnedMessage?: string | null;
    closed?: boolean;
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
  const [sheet, setSheet] = useState<"theme" | "schedule" | "poll" | "countdown" | null>(null);
  const [countdown, setCountdown] = useState<Countdown | null>(room.countdown ?? null);
  const [closed, setClosed] = useState(!!room.closed);
  const [votes, setVotes] = useState<PollVote[]>([]);
  const [pinnedId, setPinnedId] = useState<string | null>(room.pinnedMessage ?? null);
  const [pinnedMsg, setPinnedMsg] = useState<Message | null>(null);
  const [prefill, setPrefill] = useState<{ text: string; n: number } | null>(null);
  const [qHidden, setQHidden] = useState(true);
  // Short phones (e.g. 360×640): keep the chat area free — at most one banner at a time.
  const [smallScreen, setSmallScreen] = useState(false);
  useEffect(() => setSmallScreen(window.innerHeight < 720), []);
  const [favourites, setFavourites] = useState<Favourite[]>(initial.favourites);
  const [presence, setPresence] = useState<Record<string, PresenceInfo>>({});
  const [partnerTyping, setPartnerTyping] = useState<boolean | "recording">(false);
  const [partnerSearching, setPartnerSearching] = useState(false);
  const searchingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const trackedRef = useRef<string | null>(null);
  const beatsRef = useRef<Record<string, { at: number; seen: number }>>({});
  const presenceRef = useRef<Record<string, PresenceInfo>>({});
  const [partnerLeftAt, setPartnerLeftAt] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [jumpRequest, setJumpRequest] = useState<{ id: string; n: number } | null>(null);

  const nameOf = useCallback(
    (userId: string | null | undefined) => {
      if (!userId) return "Someone";
      if (userId === me.id) return firstName(me.name);
      return firstName(members.find((m) => m.userId === userId)?.name);
    },
    [members, me],
  );
  const nameOfRef = useRef(nameOf);
  nameOfRef.current = nameOf;
  const partner = members.find((m) => m.userId !== me.id) ?? null;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500);
  }, []);

  const broadcastPlayback = useCallback((s: PlaybackState) => {
    void roomChannelRef.current?.send({ type: "broadcast", event: "playback", payload: s });
  }, []);

  const push = usePush(me.id, features.v2);
  const [pushPromptHidden, setPushPromptHidden] = useState(true);
  useEffect(() => {
    try {
      setPushPromptHidden(localStorage.getItem("duet:push-prompt") === "hide");
    } catch {}
  }, []);
  const hidePushPrompt = () => {
    setPushPromptHidden(true);
    try {
      localStorage.setItem("duet:push-prompt", "hide");
    } catch {}
  };
  /** Is my partner looking at this room right now? Then no buzz — they'll see it anyway. */
  const partnerWatching = useCallback(() => {
    const p = Object.values(presenceRef.current).find((x) => x.userId !== me.id);
    const beat = p && beatsRef.current[p.userId];
    return !!(p?.active && beat && Date.now() - beat.seen < 45_000);
  }, [me.id]);

  /** Ask the server to buzz my partner (it builds the text from the saved message). */
  const notifyPartner = useCallback(
    (messageId: string) => {
      if (partnerWatching()) return;
      void fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: room.id, kind: "message", messageId }),
      }).catch(() => {});
    },
    [room.id, partnerWatching],
  );
  const togglePush = useCallback(async () => {
    if (push.status === "on") {
      await push.turnOff();
      return showToast("🔕 Notifications off on this phone");
    }
    if (push.status === "needs-install") return showToast("On iPhone: Share → Add to Home Screen, then open Duet from there");
    if (push.status === "blocked") return showToast("Notifications are blocked — allow them in your browser settings");
    const ok = await push.turnOn();
    showToast(ok ? "🔔 Notifications on" : "Notifications weren't allowed");
    if (ok) hidePushPrompt();
  }, [push, showToast]);

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
    if (!partnerWatching())
      void fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: room.id, kind: "nudge" }),
    }).catch(() => {});
  }, [burst, me.name, room.id, showToast, partnerWatching]);
  const sendMessageRef = useRef<(body: string, replyTo?: string | null, extra?: { kind: Message["kind"]; meta: MessageMeta }) => Promise<void>>(
    async () => {},
  );
  const lastMiss = useRef(0);
  const sendMissYou = useCallback(() => {
    const now = Date.now();
    if (now - lastMiss.current < 10_000) return showToast("Sent — they'll feel it 🥹");
    lastMiss.current = now;
    navigator.vibrate?.(20);
    burst.fire("🥹");
    void sendMessageRef.current("🥹", null, { kind: "sticker", meta: { sticker: "🥹", miss: true } });
  }, [burst, showToast]);
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
    const { data: rows } = await supabase.from("room_members").select("*").eq("room_id", room.id);
    const ids = (rows ?? []).map((r) => r.user_id as string);
    const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
    setMembers(
      (rows ?? []).map((r) => ({
        userId: r.user_id as string,
        lastReadAt: r.last_read_at as string,
        lastSeenAt: (r.last_seen_at as string | null) ?? null,
        muted: !!r.muted,
        name: (profs ?? []).find((p) => p.id === r.user_id)?.display_name ?? "Someone",
      })),
    );
  }, [supabase, room.id]);

  const loadMembersRef = useRef(loadMembers);
  loadMembersRef.current = loadMembers;

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
        .on("broadcast", { event: "searching" }, ({ payload }) => {
          if (payload?.userId === me.id) return;
          setPartnerSearching(!!payload?.on);
          if (searchingTimer.current) clearTimeout(searchingTimer.current);
          if (payload?.on) searchingTimer.current = setTimeout(() => setPartnerSearching(false), 9000);
        })
        .on("broadcast", { event: "play-request" }, ({ payload }) => {
          const r = payload as PlayRequest;
          if (!r?.track?.videoId || r.from === me.id) return;
          navigator.vibrate?.([20, 40, 20]);
          setIncoming({ ...r, track: { ...r.track, title: String(r.track.title ?? "").slice(0, 120) } });
        })
        .on("broadcast", { event: "play-response" }, ({ payload }) => onPlayResponseRef.current(payload as { id: string; choice: "now" | "next" | "keep" }))
        .on("broadcast", { event: "listen-invite" }, ({ payload }) => {
          navigator.vibrate?.([30, 60, 30]);
          burstRef.current("🎧");
          setToast(`🎧 ${firstName(String(payload?.from ?? "They"))} wants to listen together — tap ▶ Join`);
          setTimeout(() => setToast(null), 6000);
        })
        .on("broadcast", { event: "room-renamed" }, ({ payload }) => {
          if (typeof payload?.name === "string") setRoomName(payload.name);
        })
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          if (payload?.userId === me.id) return;
          setPartnerTyping(payload?.typing ? (payload?.recording ? "recording" : true) : false);
          if (typingTimer.current) clearTimeout(typingTimer.current);
          if (payload?.typing) typingTimer.current = setTimeout(() => setPartnerTyping(false), 4000);
        })
        .on("presence", { event: "sync" }, () => {
          const st = roomChannel!.presenceState<PresenceInfo>();
          const next: Record<string, PresenceInfo> = {};
          for (const [key, metas] of Object.entries(st)) {
            const last = metas[metas.length - 1];
            if (last) next[key] = { userId: key, name: last.name, listening: metas.some((m) => m.listening), active: metas.some((m) => m.active) };
            // Remember when we last heard from them (our clock — theirs may be off).
            const beat = Math.max(...metas.map((m) => Number((m as { at?: number }).at) || 0));
            if (beat && beat !== beatsRef.current[key]?.at) beatsRef.current[key] = { at: beat, seen: Date.now() };
          }
          // Partner just left → that's their "last seen" (until the database says otherwise).
          if (Object.keys(presenceRef.current).some((k) => k !== me.id && !next[k])) setPartnerLeftAt(Date.now());
          presenceRef.current = next;
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
          if (m.meta?.miss && m.user_id !== me.id && !messagesRef.current.some((x) => x.id === m.id)) {
            navigator.vibrate?.([40, 80, 40, 80, 40]);
            burstRef.current("🥹");
            setToast(`🥹 ${nameOfRef.current(m.user_id)} is missing you`);
            setTimeout(() => setToast(null), 4500);
          }
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
          const r = row as { user_id: string; last_read_at: string; last_seen_at?: string | null; muted?: boolean };
          if (r?.user_id)
            setMembers((prev) =>
              prev.map((m) =>
                m.userId === r.user_id
                  ? { ...m, lastReadAt: r.last_read_at, lastSeenAt: r.last_seen_at ?? m.lastSeenAt, muted: r.muted ?? m.muted }
                  : m,
              ),
            );
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

  // Autoplay is switched off for now: any room that still has it on gets turned off once opened.
  useEffect(() => {
    if (features.v2 && room.autoplay) void changeAutoplay(false);
  }, [features.v2, room.autoplay, changeAutoplay]);

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
        if ("countdown" in r) setCountdown((r as { countdown?: Countdown | null }).countdown ?? null);
        if ("pinned_message" in r) setPinnedId((r as { pinned_message?: string | null }).pinned_message ?? null);
        if ((r as { closed?: boolean }).closed) {
          setClosed(true);
          void loadMembersRef.current(); // they left
        }
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, room.id]);

  // Presence: "listening now" + whether the room is open on screen. While it's on screen we
  // re-announce every 30s, so a phone that vanished without saying so goes stale quickly.
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const on = () => setOnScreen(document.visibilityState === "visible");
    on();
    document.addEventListener("visibilitychange", on);
    window.addEventListener("pagehide", on);
    return () => {
      document.removeEventListener("visibilitychange", on);
      window.removeEventListener("pagehide", on);
    };
  }, []);
  useEffect(() => {
    if (!connected) return;
    const send = () =>
      void roomChannelRef.current?.track({ userId: me.id, name: me.name, listening: player.listening, active: onScreen, at: Date.now() });
    const key = `${player.listening}:${onScreen}`;
    // Leaving the screen is sent at once (the phone may freeze us any moment); the rest is debounced.
    const t = setTimeout(
      () => {
        if (trackedRef.current !== key) {
          trackedRef.current = key;
          send();
        }
      },
      trackedRef.current === null || !onScreen ? 0 : 800,
    );
    const beat = onScreen ? setInterval(send, 30_000) : undefined;
    return () => {
      clearTimeout(t);
      clearInterval(beat);
    };
  }, [player.listening, onScreen, connected, joinTick, me.id, me.name]);

  // "Last seen": tell the room I'm here every minute while it's on screen (and once when I leave).
  useEffect(() => {
    if (!features.v4) return;
    const touch = () => void supabase.rpc("touch_room", { p_room: room.id }).then(() => {});
    touch();
    if (!onScreen) return;
    const t = setInterval(touch, 60_000);
    return () => clearInterval(t);
  }, [features.v4, onScreen, supabase, room.id]);

  const myMuted = !!members.find((m) => m.userId === me.id)?.muted;
  const toggleMute = useCallback(async () => {
    const muted = !myMuted;
    setMembers((prev) => prev.map((m) => (m.userId === me.id ? { ...m, muted } : m)));
    const { error } = await supabase.rpc("set_room_prefs", { p_room: room.id, p_prefs: { muted } });
    if (error) return showToast("Couldn't change that — try again");
    showToast(muted ? "🔕 Muted — no buzzes from this room" : "🔔 Unmuted");
  }, [myMuted, me.id, supabase, room.id, showToast]);

  /** Scroll to any message — loading the history down to it first if it's older than what's on screen. */
  const jumpToMessage = useCallback(
    async (target: Pick<Message, "id" | "created_at">) => {
      if (!messagesRef.current.some((m) => m.id === target.id)) {
        const { data } = await supabase
          .from("messages")
          .select("*")
          .eq("room_id", room.id)
          .gte("created_at", target.created_at)
          .order("created_at", { ascending: true })
          .limit(1000);
        setMessages((prev) => {
          const byId = new Map(prev.map((m) => [m.id, m]));
          for (const m of (data ?? []) as Message[]) if (!byId.has(m.id)) byId.set(m.id, m);
          return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
        });
        setHasOlder(true);
      }
      setSearchOpen(false);
      setJumpRequest({ id: target.id, n: Date.now() });
    },
    [supabase, room.id],
  );

  // Opening the room clears its notifications.
  useEffect(() => {
    if (!onScreen || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.getNotifications())
      .then((list) => list?.forEach((n) => n.tag.endsWith(room.id) && n.close()))
      .catch(() => {});
  }, [onScreen, room.id, messages.length]);

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
      else notifyPartner(msg.id);
    },
    [supabase, room.id, me.id, showToast],
  );

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  // What was unread when I opened the room (for the "N unread messages" divider).
  const [unreadSince] = useState(() => initialMembers.find((m) => m.userId === me.id)?.lastReadAt ?? null);

  /** A message that failed (bad network) → send it again. Photos/voice notes need re-picking. */
  const retrying = useRef(new Set<string>());
  const retryMessage = useCallback(
    (m: Message) => {
      if (m.kind === "image" || m.kind === "voice") return showToast("Please send that again");
      if (retrying.current.has(m.id)) return; // "back online" + a tap at the same time → send once
      retrying.current.add(m.id);
      setMessages((prev) => prev.filter((x) => x.id !== m.id));
      void sendMessage(m.body, m.reply_to ?? null, m.kind !== "text" ? { kind: m.kind, meta: m.meta ?? {} } : undefined);
    },
    [sendMessage, showToast],
  );
  // Back online → quietly resend anything that failed.
  useEffect(() => {
    const onOnline = () => messagesRef.current.filter((m) => m.failed && m.kind !== "image" && m.kind !== "voice").forEach(retryMessage);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [retryMessage]);

  // ── Polls & countdown (v4) ─────────────────────────────────────────
  useEffect(() => {
    if (!features.v4) return;
    const load = () =>
      supabase
        .from("poll_votes")
        .select("message_id, room_id, user_id, choice")
        .eq("room_id", room.id)
        .then(({ data }) => data && setVotes(data as PollVote[]));
    void load();
    // Own channel: a database without polls can't break chat.
    const ch = supabase
      .channel(`polls:${room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes", filter: `room_id=eq.${room.id}` }, ({ eventType, new: row, old }) => {
        const v = (eventType === "DELETE" ? old : row) as PollVote;
        if (!v?.message_id) return;
        setVotes((prev) => {
          const rest = prev.filter((x) => !(x.message_id === v.message_id && x.user_id === v.user_id));
          return eventType === "DELETE" ? rest : [...rest, v];
        });
      })
      .subscribe((status) => status === "SUBSCRIBED" && void load());
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [features.v4, supabase, room.id]);

  const sendPoll = useCallback(
    (question: string, options: string[]) => {
      setSheet(null);
      void sendMessageRef.current(question, null, { kind: "poll", meta: { options } });
    },
    [],
  );
  const vote = useCallback(
    async (messageId: string, choice: number) => {
      const mine = votes.find((v) => v.message_id === messageId && v.user_id === me.id);
      const again = mine?.choice === choice; // tap your choice again → take the vote back
      setVotes((prev) => {
        const rest = prev.filter((v) => !(v.message_id === messageId && v.user_id === me.id));
        return again ? rest : [...rest, { message_id: messageId, room_id: room.id, user_id: me.id, choice }];
      });
      const q = supabase.from("poll_votes");
      const { error } = again
        ? await q.delete().eq("message_id", messageId).eq("user_id", me.id)
        : await q.upsert({ message_id: messageId, room_id: room.id, user_id: me.id, choice }, { onConflict: "message_id,user_id" });
      if (error) showToast("Couldn't save your vote");
    },
    [votes, supabase, room.id, me.id, showToast],
  );
  const saveCountdown = useCallback(
    async (c: Countdown | null) => {
      setSheet(null);
      const prev = countdown;
      setCountdown(c);
      const { error } = await supabase.rpc("set_countdown", { p_room: room.id, p_countdown: c });
      if (error) {
        setCountdown(prev);
        showToast("Couldn't save the countdown");
      }
    },
    [countdown, supabase, room.id, showToast],
  );

  // ── Pinned message (shared) ────────────────────────────────────────
  useEffect(() => {
    if (!pinnedId) return setPinnedMsg(null);
    const here = messagesRef.current.find((m) => m.id === pinnedId);
    if (here) return setPinnedMsg(here);
    let alive = true;
    supabase
      .from("messages")
      .select("*")
      .eq("id", pinnedId)
      .maybeSingle()
      .then(({ data }) => alive && setPinnedMsg((data as Message) ?? null));
    return () => {
      alive = false;
    };
  }, [pinnedId, supabase]);
  const pinMessage = useCallback(
    async (id: string | null) => {
      const prev = pinnedId;
      setPinnedId(id);
      const { error } = await supabase.rpc("pin_message", { p_room: room.id, p_message: id });
      if (error) {
        setPinnedId(prev);
        return showToast("Couldn't pin that");
      }
      showToast(id ? "📌 Pinned for both of you" : "Unpinned");
    },
    [pinnedId, supabase, room.id, showToast],
  );

  // ── Question of the day (couples-app style conversation starter) ───
  const qotd = questionOfTheDay();
  useEffect(() => {
    try {
      setQHidden(localStorage.getItem(`duet:qotd:${room.id}`) === qotd.key);
    } catch {
      setQHidden(false);
    }
  }, [room.id, qotd.key]);
  const hideQuestion = () => {
    setQHidden(true);
    try {
      localStorage.setItem(`duet:qotd:${room.id}`, qotd.key);
    } catch {}
  };

  // ── Send later (scheduled messages, private until delivered) ───────
  const [scheduledMsgs, setScheduledMsgs] = useState<{ id: string; body: string; send_at: string }[]>([]);
  const loadScheduled = useCallback(async () => {
    const { data } = await supabase.from("scheduled_messages").select("id, body, send_at").eq("room_id", room.id).order("send_at");
    setScheduledMsgs((data ?? []) as { id: string; body: string; send_at: string }[]);
  }, [supabase, room.id]);
  useEffect(() => {
    if (!features.v4) return;
    // Backup delivery (the database also does it every minute on its own).
    const tick = () => void supabase.rpc("deliver_due_messages").then(({ data }) => (data ? loadScheduled() : undefined));
    void loadScheduled();
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [features.v4, supabase, loadScheduled]);
  // Mine just got delivered → drop it from the "scheduled" list.
  const lastScheduledSeen = [...messages].reverse().find((m) => m.meta?.scheduled && m.user_id === me.id)?.id;
  useEffect(() => {
    if (lastScheduledSeen && features.v4) void loadScheduled();
  }, [lastScheduledSeen, features.v4, loadScheduled]);
  const scheduleMessage = useCallback(
    async (body: string, at: Date) => {
      const { error } = await supabase.from("scheduled_messages").insert({ room_id: room.id, body, send_at: at.toISOString() });
      if (error) {
        showToast("Couldn't schedule that — pick a time in the future");
        return false;
      }
      showToast(`🕛 Will send ${at.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}`);
      void loadScheduled();
      return true;
    },
    [supabase, room.id, showToast, loadScheduled],
  );
  const cancelScheduled = useCallback(
    async (id: string) => {
      setScheduledMsgs((xs) => xs.filter((x) => x.id !== id));
      await supabase.from("scheduled_messages").delete().eq("id", id);
    },
    [supabase],
  );

  // ── Listen with me (like Spotify's "Request to Jam") ───────────────
  const lastInvite = useRef(0);
  const inviteToListen = useCallback(() => {
    if (Date.now() - lastInvite.current < 30_000) return showToast("Invite sent — give them a moment 🎧");
    lastInvite.current = Date.now();
    void roomChannelRef.current?.send({ type: "broadcast", event: "listen-invite", payload: { from: me.name } });
    void fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: room.id, kind: "listen" }),
    }).catch(() => {});
    showToast(`🎧 Asked ${partner ? firstName(partner.name) : "them"} to listen with you`);
  }, [me.name, room.id, partner, showToast]);

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
      const path = messagesRef.current.find((m) => m.id === id)?.meta?.path;
      if (path) void supabase.storage.from(MEDIA_BUCKET).remove([path]); // photo / voice file goes too
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

  // Photos & voice notes: show instantly from memory, upload to private storage, then post.
  const sendMedia = useCallback(
    async (kind: "image" | "voice", blob: Blob, body: string, meta: MessageMeta) => {
      const id = crypto.randomUUID();
      const localUrl = URL.createObjectURL(blob);
      const path = `${room.id}/${id}.${extFor(blob.type)}`;
      const draft: Message = {
        id,
        room_id: room.id,
        user_id: me.id,
        kind,
        body,
        meta,
        created_at: new Date().toISOString(),
        pending: true,
        localUrl,
      };
      setMessages((prev) => [...prev, draft]);
      const up = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, { contentType: blob.type.split(";")[0] || undefined, upsert: false });
      if (up.error) {
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, pending: false, failed: true } : m)));
        return showToast(kind === "image" ? "Photo didn't upload" : "Voice note didn't upload");
      }
      const full = { ...meta, path, mime: blob.type.split(";")[0] };
      const { data, error } = await supabase
        .from("messages")
        .insert({ id, room_id: room.id, user_id: me.id, body, kind, meta: full })
        .select()
        .single();
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? (error ? { ...m, pending: false, failed: true } : { ...(data as Message), localUrl }) : m)),
      );
      if (error) showToast("Couldn't send that");
      else notifyPartner(id);
    },
    [supabase, room.id, me.id, showToast, notifyPartner],
  );

  const sendPhoto = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return showToast("That's not a photo");
      const { blob, width, height } = await downscaleImage(file);
      if (blob.size > 15 * 1024 * 1024) return showToast("That photo is too big (max 15 MB)");
      void sendMedia("image", blob, "📷 Photo", { width, height });
    },
    [sendMedia, showToast],
  );

  const sendVoice = useCallback(
    (blob: Blob, seconds: number, _mime: string, peaks?: number[]) =>
      void sendMedia("voice", blob, `🎤 Voice note (${formatTime(seconds)})`, { seconds, ...(peaks?.length ? { peaks } : {}) }),
    [sendMedia],
  );

  // A voice note playing? Soften the music on this phone only.
  useEffect(() => {
    const onDuck = (e: Event) => {
      const on = (e as CustomEvent<boolean>).detail;
      player.duck(on);
    };
    window.addEventListener("duet:duck", onDuck);
    return () => window.removeEventListener("duet:duck", onDuck);
  }, [player]);

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
  const requestPlayRef = useRef<(t: Track, by?: string | null, startSec?: number, queueItemId?: string | null, sentByPartner?: boolean) => void>(
    () => {},
  );
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
      requestPlayRef.current(track, m.user_id ?? me.id, at, null, !!m.user_id && m.user_id !== me.id);
    },
    [player, me.id],
  );

  const lastTypingSent = useRef(0);
  const sendTyping = useCallback(
    (typing: boolean, recording = false) => {
      const now = Date.now();
      if (typing && !recording && now - lastTypingSent.current < 1500) return;
      lastTypingSent.current = typing ? now : 0;
      void roomChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { userId: me.id, typing, recording } });
    },
    [me.id],
  );

  const sendSearching = useCallback(
    (on: boolean) => void roomChannelRef.current?.send({ type: "broadcast", event: "searching", payload: { userId: me.id, on } }),
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
    void supabase.rpc("mark_read", { p_room: room.id }).then(() => {
      if (features.v4) void updateAppBadge(supabase);
    });
  }, [supabase, room.id, features.v4]);

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

  /** A whole playlist at once: into Up next, Our Songs, or my favourites (duplicates skipped). */
  const importTracks = useCallback(
    async (tracks: Track[], where: "queue" | "ours" | "mine") => {
      const base = { title: "", channel: null as string | null, thumbnail: null as string | null, duration_sec: null as number | null };
      const row = (t: Track) => ({ ...base, video_id: t.videoId, title: t.title, channel: t.channel, thumbnail: t.thumbnail, duration_sec: t.durationSec });
      let error: { message: string } | null = null;
      if (where === "queue") {
        const start = Date.now() / 1000;
        ({ error } = await supabase.from("queue_items").insert(
          tracks.map((t, i) => ({ ...row(t), room_id: room.id, added_by: me.id, ...(features.v2 ? { position: start + i / 1000 } : {}) })),
        ));
      } else if (where === "ours") {
        ({ error } = await supabase
          .from("room_songs")
          .upsert(tracks.map((t) => ({ ...row(t), room_id: room.id, added_by: me.id })), { onConflict: "room_id,video_id", ignoreDuplicates: true }));
        if (!error) void loadOurSongs();
      } else {
        ({ error } = await supabase
          .from("favourites")
          .upsert(tracks.map((t) => ({ ...row(t), user_id: me.id })), { onConflict: "user_id,video_id", ignoreDuplicates: true }));
        if (!error) {
          const { data } = await supabase.from("favourites").select("*").eq("user_id", me.id).order("created_at", { ascending: false });
          if (data) setFavourites(data as Favourite[]);
        }
      }
      const n = tracks.length;
      showToast(
        error
          ? "Couldn't import — try again"
          : where === "queue"
            ? `➕ ${n} songs added to Up next`
            : where === "ours"
              ? `🎶 ${n} songs saved to Our Songs`
              : `♥ ${n} songs saved to your favourites`,
      );
    },
    [supabase, room.id, me.id, features.v2, loadOurSongs, showToast],
  );

  // ── Couple games (v6) ──────────────────────────────────────────────
  const [games, setGames] = useState<GameRow[]>([]);
  const [openGame, setOpenGame] = useState<string | null>(null);
  const [gamesPicker, setGamesPicker] = useState(false);
  const loadGames = useCallback(async () => {
    const { data } = await supabase.from("games").select("*").eq("room_id", room.id).eq("status", "active").order("updated_at", { ascending: false }).limit(10);
    setGames((data ?? []) as GameRow[]);
  }, [supabase, room.id]);
  useEffect(() => {
    if (!features.v6) return;
    void loadGames();
    // Own channel: a database without games can't break chat.
    const ch = supabase
      .channel(`games:${room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `room_id=eq.${room.id}` }, ({ new: row }) => {
        const g = row as GameRow;
        if (!g?.id) return;
        setGames((prev) => {
          const rest = prev.filter((x) => x.id !== g.id);
          return g.status === "active" ? [g, ...rest] : rest;
        });
      })
      .subscribe((s) => s === "SUBSCRIBED" && void loadGames());
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [features.v6, supabase, room.id, loadGames]);

  const startGame = useCallback(
    async (kind: GameKind) => {
      if (!partner) return showToast("Invite your person first — games need two 🎮");
      const info = gameInfo(kind);
      const { data, error } = await supabase
        .from("games")
        .insert({ room_id: room.id, kind, state: newGameState(kind, [me.id, partner.userId]) })
        .select()
        .single();
      if (error || !data) return showToast("Couldn't start the game");
      setOpenGame((data as GameRow).id);
      void sendMessageRef.current(`🎮 ${info.name} ${info.emoji}`, null, { kind: "game", meta: { gameId: (data as GameRow).id, game: kind } });
    },
    [partner, supabase, room.id, me.id, showToast],
  );
  const myTurnGame = games.find((g) => turnOf(g) === me.id);

  // ── "Pajju wants to play …" — no more songs switching under someone ─
  // If your partner is listening to a song they picked, tapping another song asks them
  // first: ▶ Play now / ⏭ Play next / Keep this. No answer in 20s → it goes to Up next.
  type PlayRequest = { id: string; from: string; fromName: string; track: Track; startSec: number; queueItemId: string | null };
  const [incoming, setIncoming] = useState<PlayRequest | null>(null);
  const pending = useRef<{ req: PlayRequest; timer: ReturnType<typeof setTimeout> } | null>(null);
  const stateRef = useRef(player.state);
  stateRef.current = player.state;
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const addToQueueTop = useCallback(
    async (t: Track, queueItemId: string | null) => {
      const q = queueRef.current;
      if (queueItemId && q.some((x) => x.id === queueItemId)) {
        if (features.v2) void reorderQueue([queueItemId, ...q.filter((x) => x.id !== queueItemId).map((x) => x.id)]);
        return;
      }
      const top = q.length ? Math.min(...q.map((x) => x.position ?? Date.parse(x.created_at) / 1000)) - 1 : Date.now() / 1000;
      await supabase.from("queue_items").insert({
        room_id: room.id,
        video_id: t.videoId,
        title: t.title,
        channel: t.channel,
        thumbnail: t.thumbnail,
        duration_sec: t.durationSec,
        added_by: me.id,
        ...(features.v2 ? { position: top } : {}),
      });
    },
    [features.v2, reorderQueue, supabase, room.id, me.id],
  );

  const needsAsking = useCallback(
    (t: Track, sentByPartner: boolean) => {
      const s = stateRef.current;
      if (!partner || !s?.videoId || !s.isPlaying || s.videoId === t.videoId) return false;
      if (sentByPartner) return false; // they sent this song (dedication / moment / link) — they want it
      if (s.addedBy === me.id) return false; // it's my pick — I can change it
      const p = presenceRef.current[partner.userId];
      return !!(p?.listening && p.active !== false); // they're actually listening right now
    },
    [partner, me.id],
  );

  /** Every "play this song" tap goes through here. */
  const requestPlay = useCallback(
    (t: Track, by: string | null = null, startSec = 0, queueItemId: string | null = null, sentByPartner = false) => {
      if (!needsAsking(t, sentByPartner)) {
        if (queueItemId) return void player.playQueueItem(queueItemId);
        return void player.playTrack(t, by ?? me.id, startSec);
      }
      if (pending.current) return showToast("Still waiting for an answer…");
      const req: PlayRequest = { id: crypto.randomUUID(), from: me.id, fromName: firstName(me.name), track: t, startSec, queueItemId };
      void roomChannelRef.current?.send({ type: "broadcast", event: "play-request", payload: req });
      const name = partner ? firstName(partner.name) : "them";
      showToast(`⏳ Asking ${name}…`);
      pending.current = {
        req,
        // Backup in case their answer never arrives: don't cut their song, queue it.
        timer: setTimeout(() => {
          if (pending.current?.req.id !== req.id) return;
          pending.current = null;
          void addToQueueTop(t, queueItemId);
          showToast(`No answer from ${name} — “${t.title}” is next in Up next`);
        }, (REQUEST_SECONDS + 3) * 1000),
      };
    },
    [needsAsking, player, me.id, me.name, partner, showToast, addToQueueTop],
  );

  const onPlayResponse = useCallback(
    (res: { id: string; choice: "now" | "next" | "keep" }) => {
      const p = pending.current;
      if (!p || p.req.id !== res.id) return;
      clearTimeout(p.timer);
      pending.current = null;
      const name = partner ? firstName(partner.name) : "They";
      if (res.choice === "now") showToast(`▶ ${name} said yes!`);
      else if (res.choice === "next") {
        void addToQueueTop(p.req.track, p.req.queueItemId);
        showToast(`⏭ “${p.req.track.title}” plays next`);
      } else showToast(`🎧 ${name} wants to finish this song first`);
    },
    [partner, showToast, addToQueueTop],
  );
  useEffect(() => {
    requestPlayRef.current = requestPlay;
  }, [requestPlay]);
  const onPlayResponseRef = useRef(onPlayResponse);
  onPlayResponseRef.current = onPlayResponse;

  const answerRequest = useCallback(
    (choice: "now" | "next" | "keep") => {
      const req = incoming;
      if (!req) return;
      setIncoming(null);
      if (choice === "now") {
        if (req.queueItemId && queueRef.current.some((q) => q.id === req.queueItemId)) void player.playQueueItem(req.queueItemId);
        else void player.playTrack(req.track, req.from, req.startSec);
      }
      void roomChannelRef.current?.send({ type: "broadcast", event: "play-response", payload: { id: req.id, choice } });
    },
    [incoming, player],
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

  // Android back closes whatever is open on top instead of leaving the room.
  useBackToClose(!!sheet, () => setSheet(null));
  useBackToClose(searchOpen, () => setSearchOpen(false));
  useBackToClose(!!dedicating, () => setDedicating(null));
  useBackToClose(renameOpen, () => setRenameOpen(false));
  useBackToClose(inviteOpen && !partner, () => setInviteOpen(false));
  useBackToClose(pinSheet, () => setPinSheet(false));
  useBackToClose(gamesPicker, () => setGamesPicker(false));

  // ── Delete / leave the room (v5) ──────────────────────────────────
  const router = useRouter();
  const deleteRoom = useCallback(async () => {
    const result = await confirmAndDeleteRoom(room.id, roomName, partner ? firstName(partner.name) : null);
    if (result) router.replace("/");
  }, [room.id, roomName, partner, router]);

  // Slim bar at the top of the chat: countdown, or "invite to listen".
  const partnerListening = !!(partner && presence[partner.userId]?.listening && presence[partner.userId]?.active !== false);
  const days = countdown ? daysUntil(countdown.date) : null;
  const showInvite = !!(features.v4 && partner && player.listening && !partnerListening);
  const showCountdown = !!(countdown && days !== null && days >= 0);
  const busyBanners = Number(showInvite) + Number(showCountdown) + Number(!!pinnedMsg) + Number(!!(myTurnGame && !openGame));
  const pushCardShowing = !!(partner && !pushPromptHidden && (push.status === "off" || push.status === "needs-install") && player.unlocked && messages.length > 0);
  const banner = (
    <>
      {pinnedMsg && !pinnedMsg.deleted_at && (
        <div className="flex max-w-full min-w-0 items-center gap-1 rounded-full bg-black/40 py-1 pr-1 pl-3 text-[12.5px] ring-1 ring-white/10 backdrop-blur">
          <button onClick={() => void jumpToMessage(pinnedMsg)} className="min-w-0 truncate text-left text-cream/85" aria-label="Go to pinned message">
            📌 <b className="font-semibold">{pinnedMsg.user_id === me.id ? "You" : nameOf(pinnedMsg.user_id)}:</b> {pinnedMsg.body}
          </button>
          <button onClick={() => void pinMessage(null)} aria-label="Unpin" className="-my-1.5 flex size-9 shrink-0 items-center justify-center rounded-full text-cream/45">
            ✕
          </button>
        </div>
      )}
      {showCountdown && countdown && days !== null && (
        <button
          onClick={() => setSheet("countdown")}
          className="flex items-center gap-1.5 rounded-full bg-black/40 px-3.5 py-1.5 text-[12.5px] font-medium text-cream/90 ring-1 ring-white/10 backdrop-blur"
        >
          {days === 0 ? `🎉 Today: ${countdown.label}` : `⏳ ${days} day${days === 1 ? "" : "s"} until ${countdown.label}`}
        </button>
      )}
      {showInvite && partner && (
        <button
          onClick={inviteToListen}
          className="flex items-center gap-1.5 rounded-full bg-rose-300/15 px-3.5 py-1.5 text-[12.5px] font-medium text-rose-100 ring-1 ring-rose-200/20 backdrop-blur"
        >
          🎧 {firstName(partner.name)} isn&apos;t listening · <b>Invite</b>
        </button>
      )}
      {myTurnGame && !openGame && (
        <button
          onClick={() => setOpenGame(myTurnGame.id)}
          className="flex items-center gap-1.5 rounded-full bg-emerald-300/15 px-3.5 py-1.5 text-[12.5px] font-medium text-emerald-100 ring-1 ring-emerald-200/20"
        >
          {gameInfo(myTurnGame.kind).emoji} Your turn in {gameInfo(myTurnGame.kind).name} · <b>Play</b>
        </button>
      )}
      {partner && !qHidden && busyBanners < (smallScreen ? 1 : 2) && !(smallScreen && pushCardShowing) && (
        <div className="flex max-w-full min-w-0 items-center gap-1 rounded-full bg-violet-300/12 py-1 pr-1 pl-3 text-[12.5px] text-violet-100 ring-1 ring-violet-200/15 backdrop-blur">
          <button
            onClick={() => {
              setPrefill({ text: `💬 ${qotd.text}\n`, n: Date.now() });
              hideQuestion();
            }}
            className="min-w-0 truncate text-left"
            aria-label="Answer today's question"
          >
            💬 <b className="font-semibold">Today:</b> {qotd.text}
          </button>
          <button onClick={hideQuestion} aria-label="Hide today's question" className="-my-1.5 flex size-9 shrink-0 items-center justify-center rounded-full text-violet-100/50">
            ✕
          </button>
        </div>
      )}
    </>
  );

  const topBar = (
    <TopBar
      roomName={roomName}
      onNudge={sendNudge}
      onMissYou={features.v2 ? sendMissYou : undefined}
      lastSeen={
        features.v4 && partner
          ? Math.max(partnerLeftAt ?? 0, partner.lastSeenAt ? Date.parse(partner.lastSeenAt) : 0) || null
          : null
      }
      muted={features.v4 ? myMuted : undefined}
      onMute={features.v4 ? toggleMute : undefined}
      onSearch={() => setSearchOpen(true)}
      onCountdown={features.v4 && !closed ? () => setSheet("countdown") : undefined}
      onDelete={features.v5 ? deleteRoom : undefined}
      closed={closed}
      onTheme={features.v2 ? () => setSheet("theme") : undefined}
      onSchedule={features.v2 ? () => setSheet("schedule") : undefined}
      togetherText={features.v2 && listened >= 60 ? togetherText(listened) : null}
      push={push.status !== "unsupported" ? { status: push.status, toggle: togglePush } : null}
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
    <div
      className="duet-bg vv-fixed overflow-clip overscroll-none text-cream"
      style={style}
      // Older iPhones ignore overflow:clip — never let the room layer itself scroll.
      onScroll={(e) => {
        if (e.currentTarget.scrollTop) e.currentTarget.scrollTop = 0;
      }}
      data-playing={player.state?.isPlaying ? "" : undefined}>
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
          onAutoplay={undefined /* autoplay hidden for now */}
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
          onImport={importTracks}
          onRequestPlay={requestPlay}
          onSearching={sendSearching}
          games={features.v6 ? { active: games, start: startGame, open: setOpenGame, turnOf, meId: me.id } : undefined}
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
          partnerTyping={partnerTyping || (partnerSearching ? "searching" : false)}
          nameOf={nameOf}
          onSend={sendMessage}
          onTyping={sendTyping}
          onBurst={sendBurst}
          v2={features.v2}
          onEdit={editMessage}
          onUnsend={unsendMessage}
          onSticker={sendSticker}
          onPlayFromMessage={playFromMessage}
          onPhoto={sendPhoto}
          onVoice={sendVoice}
          onError={showToast}
          onReact={react}
          onSeen={markRead}
          jumpRequest={jumpRequest}
          roomId={room.id}
          unreadSince={unreadSince}
          onPoll={features.v4 ? () => setSheet("poll") : undefined}
          votes={votes}
          onVote={features.v4 ? vote : undefined}
          banner={banner}
          prefill={prefill}
          onOpenGame={features.v6 ? setOpenGame : undefined}
          onGames={features.v6 ? () => setGamesPicker(true) : undefined}
          closedNotice={
            closed ? (
              <div className="flex items-center gap-3 rounded-2xl bg-zinc-900/90 p-3 pl-4 text-sm ring-1 ring-white/10">
                <span className="min-w-0 flex-1 text-cream/75">👋 Your partner left, so this room is closed. You can still read it.</span>
                <button onClick={() => void deleteRoom()} className="shrink-0 rounded-full bg-rose-300/15 px-3.5 py-2 font-semibold text-rose-200 ring-1 ring-rose-200/20">
                  Delete
                </button>
              </div>
            ) : undefined
          }
          onSchedule={features.v4 ? scheduleMessage : undefined}
          scheduled={scheduledMsgs}
          onCancelScheduled={cancelScheduled}
          onPin={features.v4 ? (id) => void pinMessage(pinnedId === id ? null : id) : undefined}
          pinnedId={pinnedId}
          onRetry={retryMessage}
          onPlayTrack={(t, by) => requestPlay(t, by ?? me.id, 0, null, !!by && by !== me.id)}
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
            ) : partner && !pushPromptHidden && (push.status === "off" || push.status === "needs-install") && player.unlocked && messages.length > 0 ? (
              <div className="animate-rise mb-2 flex items-center gap-3 rounded-2xl bg-zinc-900/90 p-2.5 pl-3.5 ring-1 ring-white/10 backdrop-blur">
                <span className="text-lg">🔔</span>
                <div className="min-w-0 flex-1 text-sm leading-snug">
                  <b>Get a buzz</b>
                  <span className="text-cream/60"> when {firstName(partner.name)} messages you</span>
                </div>
                <button onClick={togglePush} className="shrink-0 rounded-full bg-cream px-3 py-1.5 text-sm font-semibold text-ink">
                  {push.status === "needs-install" ? "How?" : "Turn on"}
                </button>
                <button onClick={hidePushPrompt} aria-label="Not now" className="-m-1 flex size-10 shrink-0 items-center justify-center rounded-full text-cream/50">
                  ✕
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
                <button onClick={() => setPinNudgeDismissed(true)} aria-label="Later" className="-m-1 flex size-10 shrink-0 items-center justify-center rounded-full text-cream/50">
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
      {searchOpen && <ChatSearch roomId={room.id} nameOf={nameOf} meId={me.id} onClose={() => setSearchOpen(false)} onPick={jumpToMessage} />}
      {sheet === "poll" && <PollSheet onClose={() => setSheet(null)} onSend={sendPoll} />}
      {sheet === "countdown" && <CountdownSheet current={countdown} onClose={() => setSheet(null)} onSave={saveCountdown} />}
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
      {gamesPicker && (
        <div className="vv-fixed z-[55] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={() => setGamesPicker(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-rise max-h-[85%] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[2rem] bg-[#1d1419] pt-5 pb-[max(env(safe-area-inset-bottom),20px)] ring-1 ring-white/10 sm:rounded-[2rem]"
          >
            <h2 className="px-5 pb-3 font-display text-2xl italic">🎮 Games</h2>
            <GamesList
              active={games}
              start={(k) => {
                setGamesPicker(false);
                void startGame(k);
              }}
              open={(id) => {
                setGamesPicker(false);
                setOpenGame(id);
              }}
              turnOf={turnOf}
              meId={me.id}
            />
          </div>
        </div>
      )}
      {openGame && <GameSheet gameId={openGame} meId={me.id} nameOf={nameOf} onClose={() => setOpenGame(null)} onError={showToast} />}
      {incoming && <PlayRequestCard key={incoming.id} fromName={incoming.fromName} track={incoming.track} onAnswer={answerRequest} />}

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
              displayName={me.name}
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
