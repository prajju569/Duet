"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Member, Message, Reaction } from "@/lib/types";
import { clockTime, dayLabel, firstName } from "@/lib/format";
import { parseTimestamp } from "@/lib/sync";
import { ClockIcon, CheckIcon, DoubleCheckIcon, SendIcon } from "@/components/ui/Icons";

const EMOJIS = ["❤️", "😂", "🥹", "😮", "🔥", "👍"];

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
  onSend: (body: string) => void;
  onTyping: (typing: boolean) => void;
  onReact: (messageId: string, emoji: string) => void;
  onSeen: () => void;
};

export function ChatPanel(props: Props) {
  const { meId, partner, messages, reactions, partnerTyping, onSeen } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [text, setText] = useState("");

  const partnerReadAt = partner ? parseTimestamp(partner.lastReadAt) : 0;
  const lastPartnerMsg = [...messages].reverse().find((m) => m.user_id && m.user_id !== meId && m.kind === "text");

  // Stay pinned to the bottom unless the user scrolled up to read history.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
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

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim()) return;
    props.onSend(text);
    props.onTyping(false);
    setText("");
    stickRef.current = true;
  }

  // Group reactions by message.
  const byMessage: Record<string, Reaction[]> = {};
  for (const r of Object.values(reactions)) {
    if (!r.emoji) continue;
    (byMessage[r.message_id] ??= []).push(r);
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      {props.topBar}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
        onClick={() => setPickerFor(null)}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-2 lg:px-6"
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
            <p className="font-display text-2xl italic text-cream/80">Say hi 👋</p>
            <p className="mt-2 text-sm">Messages stay here. Long-press any message to react.</p>
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
          const rx = byMessage[m.id] ?? [];

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
                reactions={rx}
                myReaction={reactions[`${m.id}:${meId}`]?.emoji ?? null}
                pickerOpen={pickerFor === m.id}
                onOpenPicker={() => setPickerFor(m.id)}
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

      <form onSubmit={submit} className="flex items-end gap-2 px-3 pt-1 pb-[max(env(safe-area-inset-bottom),12px)] lg:px-6 lg:pb-5">
        <textarea
          value={text}
          rows={1}
          onChange={(e) => {
            setText(e.target.value);
            props.onTyping(e.target.value.length > 0);
          }}
          onBlur={() => props.onTyping(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={partner ? `Message ${firstName(partner.name)}…` : "Message…"}
          enterKeyHint="send"
          className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl bg-white/8 px-4 py-2.5 text-[15px] leading-6 ring-1 ring-white/10 placeholder:text-cream/35 focus:ring-white/25 focus:outline-none [field-sizing:content]"
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
  reactions: Reaction[];
  myReaction: string | null;
  pickerOpen: boolean;
  onOpenPicker: () => void;
  onReact: (emoji: string) => void;
};

function Bubble({ message: m, mine, authorName, showName, tail, grouped, seen, reactions, myReaction, pickerOpen, onOpenPicker, onReact }: BubbleProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef(0);
  const [pressing, setPressing] = useState(false);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
    setPressing(false);
  };

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 || m.pending) return;
      start.current = { x: e.clientX, y: e.clientY };
      setPressing(true);
      timer.current = setTimeout(() => {
        setPressing(false);
        navigator.vibrate?.(12);
        onOpenPicker();
      }, 450);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
    },
    onPointerUp: () => {
      const wasPressing = !!timer.current;
      cancel();
      if (!wasPressing || m.pending) return;
      // Double-tap → ❤️
      const now = Date.now();
      if (now - lastTap.current < 300) onReact("❤️");
      lastTap.current = now;
    },
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      if (!m.pending) onOpenPicker();
    },
  };

  const counts = reactions.reduce<Record<string, number>>((acc, r) => ((acc[r.emoji!] = (acc[r.emoji!] ?? 0) + 1), acc), {});

  return (
    <div className={`animate-rise flex flex-col ${mine ? "items-end" : "items-start"} ${grouped ? "mt-0.5" : "mt-3"} ${reactions.length ? "mb-3" : ""}`}>
      {showName && <span className="mb-1 pl-3 text-[11px] text-cream/45">{authorName}</span>}
      <div className="relative max-w-[82%] lg:max-w-[70%]" onClick={(e) => e.stopPropagation()}>
        {pickerOpen && (
          <div
            className={`animate-pop absolute -top-12 z-20 flex gap-0.5 rounded-full bg-zinc-900/95 p-1 shadow-xl ring-1 ring-white/10 backdrop-blur ${mine ? "right-0" : "left-0"}`}
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
          </div>
        )}
        <div
          {...handlers}
          style={{ WebkitTouchCallout: "none" }}
          className={`relative px-3.5 py-2 text-[15px] leading-snug break-words whitespace-pre-wrap transition-transform duration-200 select-none ${
            pressing ? "scale-[0.97]" : ""
          } ${
            mine
              ? `bg-gradient-to-br from-rose-300 to-orange-200 text-ink ${tail ? "rounded-3xl rounded-br-md" : "rounded-3xl"}`
              : `bg-white/10 text-cream ring-1 ring-white/5 backdrop-blur ${tail ? "rounded-3xl rounded-bl-md" : "rounded-3xl"}`
          } ${m.failed ? "opacity-60" : ""}`}
        >
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
