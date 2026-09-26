"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { Message } from "@/lib/types";

/** Search this chat's messages (text, dedication notes, song moments). */
export function ChatSearch({
  roomId,
  nameOf,
  meId,
  onClose,
  onPick,
}: {
  roomId: string;
  nameOf: (id: string | null | undefined) => string;
  meId: string;
  onClose: () => void;
  onPick: (m: Message) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Message[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setResults(null);
    const t = setTimeout(async () => {
      setBusy(true);
      const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      const { data } = await getSupabase()
        .from("messages")
        .select("*")
        .eq("room_id", roomId)
        .neq("kind", "system")
        .is("deleted_at", null)
        .ilike("body", like)
        .order("created_at", { ascending: false })
        .limit(60);
      setResults((data ?? []) as Message[]);
      setBusy(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, roomId]);

  const mark = (text: string) => {
    const term = q.trim();
    const i = text.toLowerCase().indexOf(term.toLowerCase());
    if (i < 0) return text;
    const start = Math.max(0, i - 30);
    return (
      <>
        {start > 0 && "…"}
        {text.slice(start, i)}
        <mark className="rounded bg-rose-300/80 px-0.5 text-ink">{text.slice(i, i + term.length)}</mark>
        {text.slice(i + term.length)}
      </>
    );
  };

  return (
    <div className="vv-fixed z-[55] flex flex-col bg-ink/97 backdrop-blur-xl">
      <div className="flex items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),10px)] pb-2">
        <button onClick={onClose} aria-label="Close search" className="rounded-full p-2 text-cream/70">
          ✕
        </button>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search this chat"
          enterKeyHint="search"
          className="h-11 min-w-0 flex-1 rounded-full bg-white/8 px-4 text-base ring-1 ring-white/10 placeholder:text-cream/35 focus:ring-white/30 focus:outline-none"
        />
        {busy && <span className="size-4 animate-spin rounded-full border-2 border-cream/30 border-t-cream" />}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6">
        {results?.map((m) => (
          <li key={m.id}>
            <button onClick={() => onPick(m)} className="block w-full rounded-2xl px-3 py-2.5 text-left hover:bg-white/6 active:bg-white/10">
              <span className="flex items-baseline justify-between gap-2 text-xs text-cream/50">
                <b className="font-semibold text-cream/75">{m.user_id === meId ? "You" : nameOf(m.user_id)}</b>
                {new Date(m.created_at).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
              </span>
              <span className="mt-0.5 line-clamp-2 block text-[15px] text-cream/90">{mark(m.body)}</span>
            </button>
          </li>
        ))}
        {results && !results.length && <li className="py-10 text-center text-sm text-cream/45">No messages with “{q.trim()}”</li>}
        {!results && <li className="py-10 text-center text-sm text-cream/40">Type at least 2 letters</li>}
      </ul>
    </div>
  );
}
