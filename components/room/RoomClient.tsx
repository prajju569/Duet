"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { usePlaybackSync } from "@/hooks/usePlaybackSync";
import { useWakeLock } from "@/hooks/useWakeLock";
import { DEFAULT_PALETTE, paletteForVideo, type Palette } from "@/lib/colors";
import { firstName } from "@/lib/format";
import { fromRow, type PlaybackRow } from "@/lib/sync";
import type { Favourite, Member, Message, PlaybackState, PresenceInfo, QueueItem, Reaction, Track } from "@/lib/types";
import { PlayerPanel } from "./PlayerPanel";
import { ChatPanel } from "./ChatPanel";
import { TopBar } from "./TopBar";
import { JoinOverlay } from "./JoinOverlay";

/**
 * iOS keeps the page height when the keyboard opens and scrolls the whole page up,
 * pushing the mini player off-screen. Pin the app to the *visible* area instead so
 * the player stays on top and the composer sits right above the keyboard.
 */
function useVisualViewportHeight() {
  const [h, setH] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setH(Math.round(vv.height));
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return h;
}

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
  room: { id: string; code: string; name: string };
  me: { id: string; name: string };
  initialMembers: Member[];
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

export function RoomClient({ room, me, initialMembers, initial }: Props) {
  const supabase = getSupabase();
  const roomChannelRef = useRef<RealtimeChannel | null>(null);
  const teardownRef = useRef<Promise<void>>(Promise.resolve());

  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [messages, setMessages] = useState<Message[]>(initial.messages);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [hasOlder, setHasOlder] = useState(initial.hasOlder);
  const [reactions, setReactions] = useState<Record<string, Reaction>>(() => reactionMap(initial.reactions)); // key: message_id:user_id
  const [queue, setQueue] = useState<QueueItem[]>(initial.queue);
  const [favourites, setFavourites] = useState<Favourite[]>(initial.favourites);
  const [presence, setPresence] = useState<Record<string, PresenceInfo>>({});
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [palette, setPalette] = useState<Palette>(DEFAULT_PALETTE);
  const [connected, setConnected] = useState(false);
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

  const appHeight = useVisualViewportHeight();
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
    setQueue((data ?? []) as QueueItem[]);
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
        .channel(`db:${room.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter }, ({ new: row }) => {
          const m = row as Message;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev.map((x) => (x.id === m.id ? m : x)) : [...prev, m]));
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
            return q.status === "queued"
              ? [...rest, q].sort((a, b) => a.created_at.localeCompare(b.created_at))
              : rest;
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
    async (body: string, replyTo: string | null = null) => {
      const text = body.trim();
      if (!text) return;
      const msg: Message = {
        id: crypto.randomUUID(),
        room_id: room.id,
        user_id: me.id,
        kind: "text",
        body: text,
        created_at: new Date().toISOString(),
        reply_to: replyTo,
        pending: true,
      };
      setMessages((prev) => [...prev, msg]);
      const { data, error } = await supabase
        .from("messages")
        // reply_to only sent when replying, so plain messages work even before the reply migration.
        .insert({ id: msg.id, room_id: room.id, user_id: me.id, body: text, ...(replyTo ? { reply_to: replyTo } : {}) })
        .select()
        .single();
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? (error ? { ...m, pending: false, failed: true } : (data as Message)) : m)),
      );
      if (error) showToast(replyTo && /reply_to/.test(error.message) ? "Replies need the new database update (see README)" : "Message didn't send");
    },
    [supabase, room.id, me.id, showToast],
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

  const style = useMemo(
    () => ({ "--c1": palette.c1, "--c2": palette.c2, "--c3": palette.c3 }) as React.CSSProperties,
    [palette],
  );

  const topBar = (
    <TopBar
      roomName={room.name}
      code={room.code}
      me={me}
      partner={partner}
      presence={presence}
    />
  );

  return (
    <div className="duet-bg fixed inset-x-0 top-0 h-dvh overflow-hidden overscroll-none text-cream" style={{ ...style, ...(appHeight ? { height: appHeight } : {}) }} data-playing={player.state?.isPlaying ? "" : undefined}>
      <div className="relative z-10 flex h-full flex-col lg:flex-row">
        <div className="lg:hidden">{topBar}</div>
        <PlayerPanel
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
          onReact={react}
          onSeen={markRead}
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

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
          <div className="animate-rise rounded-full bg-black/70 px-4 py-2 text-sm text-cream shadow-lg backdrop-blur">{toast}</div>
        </div>
      )}
    </div>
  );
}
