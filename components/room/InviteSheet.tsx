"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { LinkIcon, XIcon } from "@/components/ui/Icons";

/** "Who are you inviting?" → a personal one-time link, ready for WhatsApp. */
export function InviteSheet({ roomId, myName, onClose }: { roomId: string; myName: string; onClose: () => void }) {
  const supabase = getSupabase();
  const [name, setName] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const first = name.trim().split(/\s+/)[0] || "you";
  const text = link ? `Hey ${first} 🎧 I made us a little room to chat and listen to songs together, in sync. Tap to join: ${link}` : "";

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.rpc("create_invite", { p_room: roomId, p_name: name.trim() });
    setBusy(false);
    if (error || !data) {
      return setMsg(error?.message.includes("ROOM_FULL") ? "Your room already has two people." : "Couldn't create the link — try again.");
    }
    setLink(`${window.location.origin}/i/${data as string}`);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  return (
    <div className="vv-fixed z-[55] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="animate-rise w-full max-w-md rounded-t-[2rem] bg-[#1d1419] p-6 pb-[max(env(safe-area-inset-bottom),24px)] ring-1 ring-white/10 sm:rounded-[2rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-2xl italic">{link ? `Send it to ${first}` : "Who's joining you?"}</h2>
            <p className="mt-1 text-sm text-cream/60">
              {link ? "One tap for them — no sign-up. The link works once and lasts 7 days." : "Type their name — we'll make a personal link."}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="-mt-1 -mr-2 rounded-full p-2 text-cream/60 hover:bg-white/10">
            <XIcon size={18} />
          </button>
        </div>

        {!link ? (
          <form onSubmit={create} className="mt-5 flex gap-2">
            <input
              autoFocus
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder="Their name"
              className="h-12 min-w-0 flex-1 rounded-2xl bg-white/8 px-4 text-base ring-1 ring-white/10 placeholder:text-cream/35 focus:ring-white/30 focus:outline-none"
            />
            <button disabled={busy || !name.trim()} className="rounded-2xl bg-cream px-5 font-semibold text-ink disabled:opacity-40">
              {busy ? "…" : "Create link"}
            </button>
          </form>
        ) : (
          <div className="mt-5 space-y-2.5">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(text)}`}
              target="_blank"
              rel="noreferrer"
              className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] font-semibold text-[#0b2b17] active:scale-[0.98]"
            >
              Share on WhatsApp
            </a>
            <button onClick={copy} className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-white/10 font-semibold ring-1 ring-white/15 active:scale-[0.98]">
              <LinkIcon size={16} />
              {copied ? "Copied ✓" : "Copy invite message"}
            </button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button
                onClick={() => navigator.share({ title: `${myName} invited you to Duet`, text }).catch(() => {})}
                className="w-full py-2 text-sm text-cream/60"
              >
                More ways to share…
              </button>
            )}
            <p className="truncate rounded-xl bg-black/25 px-3 py-2 font-mono text-xs text-cream/45">{link}</p>
          </div>
        )}
        {msg && <p className="mt-3 text-sm text-rose-300">{msg}</p>}
      </div>
    </div>
  );
}
