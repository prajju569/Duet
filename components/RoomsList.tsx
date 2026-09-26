"use client";

import Link from "next/link";
import { useBackToClose } from "@/lib/backStack";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { updateAppBadge } from "@/lib/badge";
import { confirmAndDeleteRoom } from "@/lib/deleteRoom";
import { getSupabase } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { firstName } from "@/lib/format";

export type HomeRoom = {
  id: string;
  code: string;
  name: string;
  partner_id: string | null;
  partner_name: string | null;
  last_body: string | null;
  last_kind: string | null;
  last_user: string | null;
  last_at: string | null;
  unread: number;
  // v3 database
  last_meta?: { miss?: boolean; title?: string } | null;
  last_deleted?: boolean;
  dedication?: { by: string; at: string; title: string | null; videoId: string | null; note: string | null } | null;
  // v4 database: my own settings for the room
  pinned?: boolean;
  muted?: boolean;
  archived?: boolean;
  marked_unread?: boolean;
  partner_last_seen?: string | null;
  now_playing?: { title: string | null; videoId: string | null } | null;
};

type Pref = "pinned" | "muted" | "archived" | "marked_unread";

const sortRooms = (rs: HomeRoom[]) =>
  [...rs].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (b.last_at ?? "").localeCompare(a.last_at ?? ""));

/** What the last message was, WhatsApp-style ("📷 Photo", "💌 Dedicated Kajra Re"…). */
function describe(r: HomeRoom, meId: string) {
  const mine = r.last_user === meId;
  const who = mine ? "You" : firstName(r.partner_name);
  const body = r.last_body ?? "";
  if (r.last_deleted) return `${mine ? "You: " : ""}🚫 Message deleted`;
  switch (r.last_kind) {
    case "system":
      return body;
    case "image":
      return `${mine ? "You: " : ""}📷 Photo`;
    case "voice":
      return `${mine ? "You: " : ""}🎤 Voice note`;
    case "sticker":
      return r.last_meta?.miss || (body === "🥹" && r.last_meta === undefined)
        ? `🥹 ${mine ? "You miss them" : `${who} misses you`}`
        : `${mine ? "You: " : ""}${body} Sticker`;
    case "dedication":
      return `💌 ${who} dedicated ${body.replace(/^💌\s*/, "")}${mine ? "" : " to you"}`;
    case "game":
      return `${mine ? "You" : who} started ${body.replace(/^🎮\s*/, "")}`;
    case "poll":
      return `📊 ${mine ? "You" : who}: ${body}`;
    case "moment":
      return `${mine ? "You" : who} shared a moment · ${body.replace(/^🎵\s*/, "")}`;
    default:
      return `${mine ? "You: " : ""}${body}`;
  }
}

function when(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function RoomsList({ rooms: initial, meId, canDelete = false }: { rooms: HomeRoom[]; meId: string; canDelete?: boolean }) {
  const supabase = getSupabase();
  const [rooms, setRooms] = useState(initial);
  const [renaming, setRenaming] = useState<HomeRoom | null>(null);
  const [menuFor, setMenuFor] = useState<HomeRoom | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  useBackToClose(!!menuFor, () => setMenuFor(null));
  useBackToClose(!!renaming, () => setRenaming(null));
  const hasPrefs = initial.some((r) => r.pinned !== undefined);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    const d: Record<string, string> = {};
    try {
      for (const r of initial) {
        const v = localStorage.getItem(`duet:draft:${r.id}`);
        if (v?.trim()) d[r.id] = v.trim();
      }
    } catch {}
    setDrafts(d);
  }, [initial]);

  // App-icon badge = unread in rooms you haven't muted or archived.
  useEffect(() => {
    if (!hasPrefs) return;
    void updateAppBadge(supabase, rooms.filter((r) => !r.muted && !r.archived).reduce((n, r) => n + r.unread, 0));
  }, [rooms, hasPrefs, supabase]);

  async function setPref(r: HomeRoom, key: Pref, value: boolean) {
    setMenuFor(null);
    setRooms((rs) => sortRooms(rs.map((x) => (x.id === r.id ? { ...x, [key]: value } : x))));
    const { error } = await supabase.rpc("set_room_prefs", { p_room: r.id, p_prefs: { [key]: value } });
    if (error) setRooms((rs) => sortRooms(rs.map((x) => (x.id === r.id ? { ...x, [key]: !value } : x))));
  }
  const active = rooms.filter((r) => !r.archived);
  const archived = rooms.filter((r) => r.archived);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!renaming || !draft.trim()) return;
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.rpc("rename_room", { p_room: renaming.id, p_name: draft });
    setBusy(false);
    if (error) return setErr("Couldn't rename — try again.");
    setRooms((rs) => rs.map((r) => (r.id === renaming.id ? { ...r, name: data as string } : r)));
    setRenaming(null);
  }

  return (
    <>
      <ul className="mt-3 space-y-2">
        {[...active, ...(showArchived ? archived : [])].map((r) => {
          const preview = r.last_body
            ? describe(r, meId)
            : r.partner_name
              ? "Say hi 👋"
              : "Waiting for your person — tap to invite";
          return (
            <li key={r.id} className="relative">
              <Link
                href={`/room/${r.code}`}
                className="flex items-center gap-3 rounded-2xl bg-white/6 py-3.5 pr-12 pl-3.5 ring-1 ring-white/10 transition hover:bg-white/10 active:scale-[0.99]"
              >
                {r.partner_id ? (
                  <Avatar userId={r.partner_id} name={r.partner_name ?? "?"} size={44} />
                ) : (
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/8 text-lg ring-1 ring-white/10">
                    ＋
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate font-display text-lg italic">{r.name}</span>
                    {r.pinned && <span aria-label="Pinned" className="shrink-0 text-xs">📌</span>}
                    {r.muted && <span aria-label="Muted" className="shrink-0 text-xs opacity-70">🔕</span>}
                    {r.archived && <span className="shrink-0 rounded-full bg-white/10 px-1.5 text-[10px] text-cream/60">Archived</span>}
                    <span className="ml-auto shrink-0 text-[11px] text-cream/40">{when(r.last_at)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`truncate text-[13px] ${r.unread ? "font-medium text-cream" : "text-cream/50"}`}>
                      {r.partner_name && <span className="text-cream/70">with {firstName(r.partner_name)} · </span>}
                      {drafts[r.id] ? (
                        <>
                          <span className="font-semibold text-emerald-300">Draft:</span> {drafts[r.id]}
                        </>
                      ) : (
                        preview
                      )}
                    </span>
                    {r.unread > 0 ? (
                      <span
                        className={`ml-auto min-w-5 shrink-0 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold ${r.muted ? "bg-white/25 text-cream" : "bg-rose-400 text-ink"}`}
                      >
                        {r.unread > 99 ? "99+" : r.unread}
                      </span>
                    ) : (
                      r.marked_unread && <span aria-label="Marked unread" className="ml-auto size-3 shrink-0 rounded-full bg-rose-400" />
                    )}
                  </div>
                  {r.now_playing?.title && (
                    <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[12px] text-emerald-200/90">
                      <span className="flex h-3 items-end gap-[2px]" aria-hidden>
                        <span className="w-[3px] animate-pulse rounded-full bg-emerald-300" style={{ height: "60%" }} />
                        <span className="w-[3px] animate-pulse rounded-full bg-emerald-300 [animation-delay:200ms]" style={{ height: "100%" }} />
                        <span className="w-[3px] animate-pulse rounded-full bg-emerald-300 [animation-delay:400ms]" style={{ height: "40%" }} />
                      </span>
                      <span className="truncate">Now playing · {r.now_playing.title}</span>
                    </div>
                  )}
                  {r.dedication?.title && r.last_kind !== "dedication" && (
                    <div className="mt-1.5 flex min-w-0 items-center gap-1.5 rounded-full bg-rose-300/12 py-1 pr-3 pl-1.5 text-[12px] text-rose-100 ring-1 ring-rose-200/15">
                      <span aria-hidden>💌</span>
                      <span className="truncate">
                        {r.dedication.by === meId ? "You dedicated" : `${firstName(r.partner_name)} dedicated`} <b>{r.dedication.title}</b>
                        {r.dedication.by === meId ? "" : " to you"}
                        {r.dedication.note ? ` · “${r.dedication.note}”` : ""}
                      </span>
                    </div>
                  )}
                </div>
              </Link>
              <button
                onClick={() => {
                  if (!hasPrefs) {
                    setRenaming(r);
                    setDraft(r.name);
                    setErr(null);
                  } else setMenuFor(r);
                }}
                aria-label={hasPrefs ? `Options for ${r.name}` : `Rename ${r.name}`}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-2 text-cream/45 hover:bg-white/10 hover:text-cream"
              >
                {hasPrefs ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <circle cx="12" cy="5" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="19" r="2" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {archived.length > 0 && (
        <button onClick={() => setShowArchived((v) => !v)} className="mt-3 w-full rounded-2xl py-2.5 text-sm text-cream/55 hover:bg-white/5">
          🗄️ {showArchived ? "Hide archived" : `Archived (${archived.length})`}
        </button>
      )}

      {menuFor &&
        createPortal(
          <div className="vv-fixed z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={() => setMenuFor(null)}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="animate-rise w-full max-w-md rounded-t-[2rem] bg-[#1d1419] p-3 pb-[max(env(safe-area-inset-bottom),16px)] ring-1 ring-white/10 sm:rounded-[2rem]"
            >
              <div className="px-3 pt-2 pb-3 font-display text-xl italic">{menuFor.name}</div>
              {(
                [
                  ["pinned", menuFor.pinned ? "📌 Unpin" : "📌 Pin to top"],
                  ["muted", menuFor.muted ? "🔔 Unmute" : "🔕 Mute notifications"],
                  ["marked_unread", menuFor.marked_unread ? "✅ Mark as read" : "🔴 Mark as unread"],
                  ["archived", menuFor.archived ? "🗄️ Unarchive" : "🗄️ Archive"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setPref(menuFor, key, !menuFor[key])}
                  className="flex w-full items-center rounded-2xl px-3 py-3.5 text-left text-[15px] hover:bg-white/8 active:bg-white/10"
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => {
                  setRenaming(menuFor);
                  setDraft(menuFor.name);
                  setErr(null);
                  setMenuFor(null);
                }}
                className="flex w-full items-center rounded-2xl px-3 py-3.5 text-left text-[15px] hover:bg-white/8 active:bg-white/10"
              >
                ✏️ Rename
              </button>
              {canDelete && (
                <button
                  onClick={async () => {
                    const r = menuFor;
                    setMenuFor(null);
                    const result = await confirmAndDeleteRoom(r.id, r.name, r.partner_name ? firstName(r.partner_name) : null);
                    if (result) setRooms((rs) => rs.filter((x) => x.id !== r.id));
                  }}
                  className="flex w-full items-center rounded-2xl px-3 py-3.5 text-left text-[15px] text-rose-300 hover:bg-white/8 active:bg-white/10"
                >
                  🗑️ Delete room
                </button>
              )}
            </div>
          </div>,
          document.body, // the page's entrance animation would otherwise trap this sheet
        )}

      {renaming &&
        createPortal(
          <RenameSheet
            value={draft}
            onChange={setDraft}
            onSubmit={saveName}
            onClose={() => setRenaming(null)}
            busy={busy}
            error={err}
          />,
          document.body,
        )}
    </>
  );
}

export function RenameSheet({
  value,
  onChange,
  onSubmit,
  onClose,
  busy,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="vv-fixed z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="animate-rise w-full max-w-md rounded-t-[2rem] bg-[#1d1419] p-6 pb-[max(env(safe-area-inset-bottom),24px)] ring-1 ring-white/10 sm:rounded-[2rem]"
      >
        <h2 className="font-display text-2xl italic">Rename room</h2>
        <p className="mt-1 text-sm text-cream/60">You both see the new name.</p>
        <input
          autoFocus
          value={value}
          maxLength={40}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          placeholder="e.g. Our late-night songs 🌙"
          className="mt-4 h-12 w-full rounded-2xl bg-white/8 px-4 text-base ring-1 ring-white/10 placeholder:text-cream/35 focus:ring-white/30 focus:outline-none"
        />
        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="h-12 flex-1 rounded-2xl bg-white/8 font-semibold ring-1 ring-white/10">
            Cancel
          </button>
          <button disabled={busy || !value.trim()} className="h-12 flex-1 rounded-2xl bg-cream font-semibold text-ink disabled:opacity-40">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
