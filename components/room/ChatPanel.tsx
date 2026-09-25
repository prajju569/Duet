"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Member, Message, Reaction } from "@/lib/types";
import { clockTime, dayLabel, firstName } from "@/lib/format";
import { parseTimestamp } from "@/lib/sync";
import { ChevronDown, ClockIcon, CheckIcon, DoubleCheckIcon, ReplyIcon, SendIcon, XIcon } from "@/components/ui/Icons";

const EMOJIS = ["❤️", "😂", "🥹", "😮", "🔥", "👍"];
/** How far (px) a message must be dragged to trigger a reply. */
const SWIPE_TRIGGER = 56;
const SWIPE_MAX = 84;

type Props = {
  topBar: React.ReactNode;
  meId: string;
  partner: Member | null;
  messages: Message[];
  reactions: Record<string, Reaction>;
  hasOlder: boolean;
  onLoadOlder: () => void;
  partnerTyping: boolean;
  nameOf: (userId: string | null | undefined) => string;
  onSend: (body: string, replyTo: string | null) => void;
  onTyping: (typing: boolean) => void;
  onReact: (messageId: string, emoji: string) => void;
  onSeen: () => void;
  /** Optional card shown just above the message box. */
  notice?: React.ReactNode;
};

export function ChatPanel(props: Props) {
  const { meId, partner, messages, reactions, partnerTyping, onSeen } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickRef = useRef(true);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unseenBelow, setUnseenBelow] = useState(0);
  const [flashId, setFlashId] = useState<string | null>(null);

  const byId = new Map(messages.map((m) => [m.id, m]));
  const partnerReadAt = partner ? parseTimestamp(partner.lastReadAt) : 0;
  const lastPartnerMsg = [...messages].reverse().find((m) => m.user_id && m.user_id !== meId && m.kind === "text");

  // Stay pinned to the bottom unless the user scrolled up to read history.
  const prevCount = useRef(messages.length);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const added = messages.length - prevCount.current;
    prevCount.current = messages.length;
    if (!el) return;
    if (stickRef.current) el.scrollTop = el.scrollHeight;
    else if (added > 0) setUnseenBelow((n) => n + added);
  }, [messages.length, partnerTyping]);

  // Seen ticks: mark read whenever a new message from them is on screen.
  useEffect(() => {
    if (lastPartnerMsg) onSeen();
    const onFocus = () => lastPartnerMsg && onSeen();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [lastPartnerMsg?.id, onSeen]); // eslint-disable-line react-hooks/exhaustive-deps

  function scrollToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    setUnseenBelow(0);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  function jumpTo(id: string) {
    const target = document.getElementById(`msg-${id}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashId(id);
    setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1400);
  }

  function startReply(m: Message) {
    setReplyTo(m);
    setPickerFor(null);
    navigator.vibrate?.(10);
    inputRef.current?.focus();
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim()) return;
    props.onSend(text, replyTo?.id ?? null);
    props.onTyping(false);
    setText("");
    setReplyTo(null);
    stickRef.current = true;
    setUnseenBelow(0);
  }

  // Group reactions by message.
  const byMessage: Record<string, Reaction[]> = {};
  for (const r of Object.values(reactions)) {
    if (!r.emoji) continue;
    (byMessage[r.message_id] ??= []).push(r);
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col">
      {props.topBar}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          stickRef.current = bottom;
          setAtBottom(bottom);
          if (bottom) setUnseenBelow(0);
        }}
        onClick={() => setPickerFor(null)}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 pt-3 pb-2 lg:px-6"
      >
        {props.hasOlder && (
          <div className="mb-3 flex justify-center">
            <button onClick={props.onLoadOlder} className="rounded-full bg-white/5 px-3 py-1 text-xs text-cream/60 ring-1 ring-white/10">
              Load earlier
            </button>
          </div>
        )}

        {!messages.length && (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center text-cream/50">
            <p className="font-display text-2xl text-cream/80 italic">Say hi 👋</p>
            <p className="mt-2 text-sm">Swipe a message right to reply. Long-press to react.</p>
          </div>
        )}

        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const newDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
          const dayHeader = newDay && (
            <div className="my-4 flex justify-center">
              <span className="rounded-full bg-black/25 px-3 py-0.5 text-[11px] text-cream/50">{dayLabel(m.created_at)}</span>
            </div>
          );

          if (m.kind === "system") {
            return (
              <Fragment key={m.id}>
                {dayHeader}
                <div className="animate-rise my-2.5 flex justify-center">
                  <span className="max-w-[85%] truncate rounded-full bg-white/7 px-3.5 py-1 text-xs text-cream/70 ring-1 ring-white/5">{m.body}</span>
                </div>
              </Fragment>
            );
          }

          const mine = m.user_id === meId;
          const sameAsPrev = !newDay && prev?.kind === "text" && prev.user_id === m.user_id;
          const sameAsNext = next?.kind === "text" && next.user_id === m.user_id && dayLabel(next.created_at) === dayLabel(m.created_at);
          const seen = mine && !m.pending && partnerReadAt >= parseTimestamp(m.created_at);
          const quoted = m.reply_to ? (byId.get(m.reply_to) ?? null) : null;

          return (
            <Fragment key={m.id}>
              {dayHeader}
              <Bubble
                message={m}
                mine={mine}
                authorName={props.nameOf(m.user_id)}
                showName={!mine && !sameAsPrev}
                tail={!sameAsNext}
                grouped={sameAsPrev}
                seen={seen}
                flash={flashId === m.id}
                quote={m.reply_to ? { message: quoted, name: quoted ? (quoted.user_id === meId ? "You" : props.nameOf(quoted.user_id)) : "" } : null}
                onQuoteClick={() => m.reply_to && jumpTo(m.reply_to)}
                reactions={byMessage[m.id] ?? []}
                myReaction={reactions[`${m.id}:${meId}`]?.emoji ?? null}
                pickerOpen={pickerFor === m.id}
                onOpenPicker={() => setPickerFor(m.id)}
                onReply={() => startReply(m)}
                onReact={(emoji) => {
                  props.onReact(m.id, emoji);
                  setPickerFor(null);
                }}
              />
            </Fragment>
          );
        })}

        {partnerTyping && partner && (
          <div className="animate-rise mt-2 flex items-center gap-2 pl-1 text-xs text-cream/55">
            <span className="flex gap-1 rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-3">
              <span className="typing-dot" />
              <span className="typing-dot [animation-delay:150ms]" />
              <span className="typing-dot [animation-delay:300ms]" />
            </span>
            {firstName(partner.name)} is typing…
          </div>
        )}
      </div>

      {/* Jump to latest */}
      {!atBottom && (
        <button
          onClick={scrollToBottom}
          aria-label="Jump to latest message"
          className="animate-pop absolute right-4 bottom-[calc(max(env(safe-area-inset-bottom),12px)+64px)] z-10 flex size-11 items-center justify-center rounded-full bg-zinc-900/90 text-cream shadow-xl ring-1 ring-white/15 backdrop-blur active:scale-90 lg:right-8"
          style={replyTo ? { bottom: "calc(max(env(safe-area-inset-bottom),12px) + 120px)" } : undefined}
        >
          <ChevronDown size={22} />
          {unseenBelow > 0 && (
            <span className="absolute -top-1.5 -right-1 min-w-5 rounded-full bg-rose-400 px-1.5 text-center text-[11px] leading-5 font-semibold text-ink">
              {unseenBelow > 99 ? "99+" : unseenBelow}
            </span>
          )}
        </button>
      )}

      <div className="px-3 pt-1 pb-[max(env(safe-area-inset-bottom),12px)] lg:px-6 lg:pb-5">
        {props.notice}
        {replyTo && (
          <div className="animate-rise mb-2 flex items-center gap-3 rounded-2xl bg-white/7 py-2 pr-2 pl-3 ring-1 ring-white/10">
            <div className="min-w-0 flex-1 border-l-2 border-rose-300 pl-2.5">
              <div className="text-xs font-semibold text-rose-200">
                Replying to {replyTo.user_id === meId ? "yourself" : props.nameOf(replyTo.user_id)}
              </div>
              <div className="truncate text-[13px] text-cream/70">{replyTo.body}</div>
            </div>
            <button onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="rounded-full p-1.5 text-cream/60 hover:bg-white/10">
              <XIcon size={16} />
            </button>
          </div>
        )}
        <form onSubmit={submit} className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={text}
            rows={1}
            onChange={(e) => {
              setText(e.target.value);
              props.onTyping(e.target.value.length > 0);
            }}
            onBlur={() => props.onTyping(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setReplyTo(null);
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={partner ? `Message ${firstName(partner.name)}…` : "Message…"}
            enterKeyHint="send"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl bg-white/8 px-4 py-2.5 text-base leading-6 ring-1 ring-white/10 [field-sizing:content] placeholder:text-cream/35 focus:ring-white/25 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Send"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-cream text-ink transition active:scale-90 disabled:opacity-30"
          >
            <SendIcon size={18} />
          </button>
        </form>
      </div>
    </main>
  );
}

type BubbleProps = {
  message: Message;
  mine: boolean;
  authorName: string;
  showName: boolean;
  tail: boolean;
  grouped: boolean;
  seen: boolean;
  flash: boolean;
  quote: { message: Message | null; name: string } | null;
  onQuoteClick: () => void;
  reactions: Reaction[];
  myReaction: string | null;
  pickerOpen: boolean;
  onOpenPicker: () => void;
  onReply: () => void;
  onReact: (emoji: string) => void;
};

function Bubble({
  message: m,
  mine,
  authorName,
  showName,
  tail,
  grouped,
  seen,
  flash,
  quote,
  onQuoteClick,
  reactions,
  myReaction,
  pickerOpen,
  onOpenPicker,
  onReply,
  onReact,
}: BubbleProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const swiping = useRef(false);
  const lastTap = useRef(0);
  const [pressing, setPressing] = useState(false);
  const [dx, setDx] = useState(0);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPressing(false);
  };
  const reset = () => {
    clearTimer();
    start.current = null;
    swiping.current = false;
    setDx(0);
  };

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 || m.pending) return;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      swiping.current = false;
      setPressing(true);
      timer.current = setTimeout(() => {
        setPressing(false);
        timer.current = null;
        navigator.vibrate?.(12);
        onOpenPicker();
      }, 450);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (!s) return;
      const mx = e.clientX - s.x;
      const my = e.clientY - s.y;
      if (!swiping.current) {
        if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) return reset(); // vertical scroll
        if (mx > 10 && mx > Math.abs(my)) {
          // Horizontal drag to the right → swipe-to-reply.
          swiping.current = true;
          clearTimer();
          (e.currentTarget as HTMLElement).setPointerCapture?.(s.id);
        } else if (Math.hypot(mx, my) > 10) return clearTimer();
      }
      if (swiping.current) {
        const next = Math.max(0, Math.min(SWIPE_MAX, mx * 0.8));
        if (next >= SWIPE_TRIGGER && dx < SWIPE_TRIGGER) navigator.vibrate?.(8);
        setDx(next);
      }
    },
    onPointerUp: () => {
      if (swiping.current) {
        const trigger = dx >= SWIPE_TRIGGER;
        reset();
        if (trigger) onReply();
        return;
      }
      const wasPressing = !!timer.current;
      reset();
      if (!wasPressing || m.pending) return;
      // Double-tap → ❤️
      const now = Date.now();
      if (now - lastTap.current < 300) onReact("❤️");
      lastTap.current = now;
    },
    onPointerLeave: () => !swiping.current && reset(),
    onPointerCancel: reset,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      if (!m.pending) onOpenPicker();
    },
  };

  const counts = reactions.reduce<Record<string, number>>((acc, r) => ((acc[r.emoji!] = (acc[r.emoji!] ?? 0) + 1), acc), {});

  return (
    <div
      id={`msg-${m.id}`}
      className={`animate-rise relative flex flex-col ${mine ? "items-end" : "items-start"} ${grouped ? "mt-0.5" : "mt-3"} ${reactions.length ? "mb-3" : ""}`}
    >
      {showName && <span className="mb-1 pl-3 text-[11px] text-cream/45">{authorName}</span>}
      <div
        className="relative max-w-[82%] lg:max-w-[70%]"
        onClick={(e) => e.stopPropagation()}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? "none" : "transform 0.25s cubic-bezier(0.2, 1.2, 0.4, 1)" }}
      >
        {/* Reply arrow, revealed from behind the bubble while swiping */}
        <div
          className="pointer-events-none absolute top-1/2 right-full mr-2 flex size-8 items-center justify-center rounded-full bg-white/10 text-cream"
          style={{ opacity: Math.min(1, dx / SWIPE_TRIGGER), transform: `translateY(-50%) scale(${0.6 + Math.min(1, dx / SWIPE_TRIGGER) * 0.4})` }}
        >
          <ReplyIcon size={16} />
        </div>
        {pickerOpen && (
          <div
            className={`animate-pop absolute -top-12 z-20 flex items-center gap-0.5 rounded-full bg-zinc-900/95 p-1 shadow-xl ring-1 ring-white/10 backdrop-blur ${mine ? "right-0" : "left-0"}`}
          >
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => onReact(e)}
                className={`flex size-9 items-center justify-center rounded-full text-xl transition hover:scale-125 active:scale-95 ${myReaction === e ? "bg-white/15" : ""}`}
              >
                {e}
              </button>
            ))}
            <span className="mx-0.5 h-6 w-px bg-white/15" />
            <button onClick={onReply} aria-label="Reply" className="flex size-9 items-center justify-center rounded-full text-cream/80 hover:bg-white/10">
              <ReplyIcon size={17} />
            </button>
          </div>
        )}
        <div
          {...handlers}
          style={{ WebkitTouchCallout: "none", touchAction: "pan-y" }}
          className={`relative px-3.5 py-2 text-[15px] leading-snug break-words whitespace-pre-wrap transition-[transform,box-shadow] duration-200 select-none ${
            pressing ? "scale-[0.97]" : ""
          } ${flash ? "ring-2 ring-rose-300" : ""} ${
            mine
              ? `bg-gradient-to-br from-rose-300 to-orange-200 text-ink ${tail ? "rounded-3xl rounded-br-md" : "rounded-3xl"}`
              : `bg-white/10 text-cream ring-1 ring-white/5 backdrop-blur ${tail ? "rounded-3xl rounded-bl-md" : "rounded-3xl"}`
          } ${m.failed ? "opacity-60" : ""}`}
        >
          {quote && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onQuoteClick}
              className={`mb-1.5 block w-full max-w-64 rounded-xl border-l-[3px] px-2.5 py-1.5 text-left ${
                mine ? "border-ink/40 bg-ink/10" : "border-rose-300 bg-black/20"
              }`}
            >
              <span className={`block text-[11.5px] font-semibold ${mine ? "text-ink/75" : "text-rose-200"}`}>{quote.message ? quote.name : "Message"}</span>
              <span className={`line-clamp-2 text-[13px] ${mine ? "text-ink/70" : "text-cream/65"}`}>{quote.message ? quote.message.body : "Earlier message"}</span>
            </button>
          )}
          {m.body}
          <span className={`ml-2 inline-flex translate-y-[3px] items-center gap-0.5 align-baseline text-[10px] ${mine ? "text-ink/55" : "text-cream/40"}`}>
            {clockTime(m.created_at)}
            {mine &&
              (m.failed ? (
                <span className="text-red-700">!</span>
              ) : m.pending ? (
                <ClockIcon size={11} />
              ) : seen ? (
                <DoubleCheckIcon size={13} className="text-sky-700" />
              ) : (
                <CheckIcon size={12} />
              ))}
          </span>
        </div>
        {reactions.length > 0 && (
          <button
            onClick={onOpenPicker}
            className={`animate-pop absolute -bottom-3.5 flex items-center gap-0.5 rounded-full bg-zinc-900 px-1.5 py-0.5 text-[13px] shadow ring-1 ring-white/10 ${mine ? "right-2" : "left-2"}`}
          >
            {Object.entries(counts).map(([e, n]) => (
              <span key={e}>
                {e}
                {n > 1 && <span className="ml-0.5 text-[10px] text-cream/60">{n}</span>}
              </span>
            ))}
          </button>
        )}
      </div>
    </div>
  );
}
