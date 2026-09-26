"use client";

import { useEffect, useRef, useState } from "react";
import type { Message } from "@/lib/types";

const QUICK = ["❤️", "😂", "🔥", "😮", "💃", "🕺", "🥹", "👏"];

/** One-line text for a message inside the small in-game chat. */
function preview(m: Message): string {
  if (m.deleted_at) return m.body && m.body !== "Message deleted" ? `🙊 ${m.body}` : "🚫 Message deleted";
  switch (m.kind) {
    case "image":
      return "📷 Photo";
    case "voice":
      return "🎤 Voice note";
    case "poll":
      return `📊 ${m.body}`;
    case "moment":
      return `✨ ${m.body}`;
    default:
      return m.body;
  }
}

const isBigEmoji = (m: Message) => m.kind === "sticker" || (/^\p{Extended_Pictographic}/u.test(m.body) && [...m.body].length <= 3 && !/[\p{L}\p{N}]/u.test(m.body));

/**
 * The room chat, docked under every game: the last few messages, a quick reply box
 * and one-tap reactions that float on both screens.
 */
export function GameChat({
  messages,
  meId,
  partnerName,
  partnerTyping,
  onSend,
  onBurst,
  onTyping,
  onReact,
}: {
  messages: Message[];
  meId: string;
  partnerName: string;
  partnerTyping: boolean | "recording" | "searching";
  onSend: (text: string) => void;
  onBurst: (emoji: string) => void;
  onTyping: (typing: boolean) => void;
  onReact: (messageId: string, emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false); // keyboard is up
  const listRef = useRef<HTMLDivElement>(null);
  const shown = messages.filter((m) => m.kind !== "system" && m.kind !== "game").slice(open ? -40 : -2);
  const lastId = shown[shown.length - 1]?.id;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId, open, partnerTyping, typing]);
  // The list shrinks when the keyboard opens (a CSS change, no re-render) — stay on the newest message.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => (el.scrollTop = el.scrollHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    onSend(body);
    onTyping(false);
    setText("");
  };

  return (
    <div className="shrink-0 border-t border-white/10 bg-black/35 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),10px)] backdrop-blur-xl">
      <div className="mx-auto max-w-md">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between py-0.5 text-[11px] font-semibold tracking-wide text-cream/45 uppercase"
          aria-expanded={open}
        >
          <span>💬 Chat with {partnerName}</span>
          <span>{open ? "Show less ▾" : "Show more ▴"}</span>
        </button>
        <div
          ref={listRef}
          data-testid="game-chat"
          className={`flex flex-col gap-1 overflow-y-auto overscroll-contain py-1 ${
            // Sized from the visible area (--vvh shrinks when the keyboard opens), never the full screen.
            typing ? "max-h-[calc(var(--vvh,100dvh)*0.3)]" : open ? "max-h-[calc(var(--vvh,100dvh)*0.36)]" : "max-h-[76px]"
          }`}
        >
          {shown.length === 0 && <p className="py-2 text-center text-xs text-cream/40">Say something while you play 💬</p>}
          {shown.map((m) => {
            const mine = m.user_id === meId;
            const big = !m.deleted_at && isBigEmoji(m);
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  onDoubleClick={() => !mine && !m.pending && onReact(m.id, "❤️")}
                  className={
                    big
                      ? "text-3xl leading-tight"
                      : `max-w-[80%] rounded-2xl px-3 py-1.5 text-[14px] leading-snug break-words ${
                          mine ? "rounded-br-md bg-rose-400/85 text-white" : "rounded-bl-md bg-white/12 text-cream"
                        } ${m.pending ? "opacity-60" : ""}`
                  }
                >
                  {big ? (m.meta?.sticker ?? m.body) : preview(m)}
                </div>
              </div>
            );
          })}
          {partnerTyping && (
            <div className="text-xs text-cream/50 italic">
              {partnerTyping === "recording" ? `${partnerName} is recording…` : partnerTyping === "searching" ? `${partnerName} is finding a song…` : `${partnerName} is typing…`}
            </div>
          )}
        </div>
        <div className={`-mx-1 [scrollbar-width:none] ${typing ? "hidden" : "flex"} gap-0.5 overflow-x-auto py-1`}>
          {QUICK.map((e) => (
            <button
              key={e}
              type="button"
              aria-label={`Send ${e} to both screens`}
              onClick={() => onBurst(e)}
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-[22px] transition active:scale-75"
            >
              {e}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-center gap-2"
        >
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              onTyping(e.target.value.length > 0);
            }}
            onFocus={() => {
              setOpen(true);
              setTyping(true);
            }}
            onBlur={() => {
              setTyping(false);
              onTyping(false);
            }}
            placeholder="Message…"
            aria-label="Message"
            enterKeyHint="send"
            className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2.5 text-[16px] text-cream ring-1 ring-white/10 outline-none placeholder:text-cream/35 focus:ring-rose-200/50"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Send"
            // Keep the keyboard up after sending, like any chat app.
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-cream text-ink transition active:scale-90 disabled:opacity-40"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
