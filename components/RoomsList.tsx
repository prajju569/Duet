"use client";

import Link from "next/link";
import { useState } from "react";
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
};

function when(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function RoomsList({ rooms: initial, meId }: { rooms: HomeRoom[]; meId: string }) {
  const supabase = getSupabase();
  const [rooms, setRooms] = useState(initial);
  const [renaming, setRenaming] = useState<HomeRoom | null>(null);
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
        {rooms.map((r) => {
          const preview = r.last_body
            ? r.last_kind === "system"
              ? r.last_body
              : `${r.last_user === meId ? "You: " : ""}${r.last_body}`
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
                    <span className="ml-auto shrink-0 text-[11px] text-cream/40">{when(r.last_at)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`truncate text-[13px] ${r.unread ? "font-medium text-cream" : "text-cream/50"}`}>
                      {r.partner_name && <span className="text-cream/70">with {firstName(r.partner_name)} · </span>}
                      {preview}
                    </span>
                    {r.unread > 0 && (
                      <span className="ml-auto min-w-5 shrink-0 rounded-full bg-rose-400 px-1.5 text-center text-[11px] leading-5 font-semibold text-ink">
                        {r.unread > 99 ? "99+" : r.unread}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
              <button
                onClick={() => {
                  setRenaming(r);
                  setDraft(r.name);
                  setErr(null);
                }}
                aria-label={`Rename ${r.name}`}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-2 text-cream/45 hover:bg-white/10 hover:text-cream"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>

      {renaming && (
        <RenameSheet
          value={draft}
          onChange={setDraft}
          onSubmit={saveName}
          onClose={() => setRenaming(null)}
          busy={busy}
          error={err}
        />
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
