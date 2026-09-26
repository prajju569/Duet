"use client";

import { centerIn } from "@/lib/scroll";
import { bigEmojiCount } from "@/lib/chatText";
import { parseYouTubeId } from "@/lib/youtubeUrl";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Member, Message, PollVote, Reaction, Track } from "@/lib/types";
import { clockTime, dayLabel, firstName } from "@/lib/format";
import { parseTimestamp } from "@/lib/sync";
import { BURST_EMOJIS } from "./EmojiBurst";
import { thumbUrl } from "@/lib/youtube";
import { formatTime } from "@/lib/format";
import { ImageMessage, VoiceMessage } from "./MediaMessage";
import { VoiceRecorder } from "./VoiceRecorder";

const STICKERS = ["🥰", "😘", "🤗", "🥺", "😭", "😂", "🤭", "🙈", "😴", "😤", "🫶", "🫂", "💞", "💌", "🌹", "🌙", "☕", "🍫", "🎧", "🎶", "💃", "🕺", "✨", "🔥"];

const canEditMsg = (m: Message) =>
  m.kind === "text" && !m.deleted_at && !m.pending && Date.now() - new Date(m.created_at).getTime() < 24 * 3600 * 1000;
import { ChevronDown, ClockIcon, CheckIcon, DoubleCheckIcon, ReplyIcon, SendIcon, XIcon } from "@/components/ui/Icons";

const EMOJIS = ["❤️", "😂", "🥹", "😮", "🔥", "👍"];
/** How far (px) a message must be dragged to trigger a reply. */
const SWIPE_TRIGGER = 56;
const SWIPE_MAX = 84;

type Props = {
  topBar: React.ReactNode;
  /** Scroll to this message (from chat search). `n` changes on every request. */
  jumpRequest?: { id: string; n: number } | null;
  /** For drafts (kept per room on this phone). */
  roomId?: string;
  /** My "read up to" when the room opened → "N unread messages" divider. */
  unreadSince?: string | null;
  onRetry?: (m: Message) => void;
  onPlayTrack?: (t: Track, by: string | null) => void;
  /** v4: polls */
  onPoll?: () => void;
  votes?: PollVote[];
  onVote?: (messageId: string, choice: number) => void;
  /** Slim bar pinned to the top of the chat (countdown, listen invite). */
  banner?: React.ReactNode;
  /** Put this text in the message box (e.g. today's question). */
  prefill?: { text: string; n: number } | null;
  onPin?: (messageId: string) => void;
  pinnedId?: string | null;
  meId: string;
  partner: Member | null;
  messages: Message[];
  reactions: Record<string, Reaction>;
  hasOlder: boolean;
  onLoadOlder: () => void;
  partnerTyping: boolean | "recording";
  nameOf: (userId: string | null | undefined) => string;
  onSend: (body: string, replyTo: string | null) => void;
  onTyping: (typing: boolean, recording?: boolean) => void;
  onReact: (messageId: string, emoji: string) => void;
  onSeen: () => void;
  /** Optional card shown just above the message box. */
  notice?: React.ReactNode;
  /** Send a floating-emoji burst to both screens. */
  onBurst: (emoji: string) => void;
  /** Database v2 features available (edit/unsend, stickers, cards). */
  v2?: boolean;
  onEdit?: (id: string, body: string) => void;
  onUnsend?: (id: string) => void;
  onSticker?: (emoji: string) => void;
  onPlayFromMessage?: (m: Message) => void;
  onPhoto?: (file: File) => void;
  onVoice?: (blob: Blob, seconds: number, mime: string, peaks?: number[]) => void;
  onError?: (msg: string) => void;
};

export function ChatPanel(props: Props) {
  const { meId, partner, messages, reactions, partnerTyping, onSeen } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickRef = useRef(true);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [text, setText] = useState("");
  // Drafts: what you were typing stays here if you leave the room (this phone only).
  const draftKey = props.roomId ? `duet:draft:${props.roomId}` : null;
  useEffect(() => {
    if (!draftKey) return;
    try {
      const d = localStorage.getItem(draftKey);
      if (d) setText(d);
    } catch {}
  }, [draftKey]);
  useEffect(() => {
    if (!draftKey) return;
    const t = setTimeout(() => {
      try {
        if (text.trim()) localStorage.setItem(draftKey, text);
        else localStorage.removeItem(draftKey);
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [text, draftKey]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [stickers, setStickers] = useState(false);
  const [more, setMore] = useState(false);
  const [recording, setRecording] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const [canRecord, setCanRecord] = useState(false);
  useEffect(() => setCanRecord(typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia), []);
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

  // Opening a room with unread messages → start at the first one (if they don't all fit).
  const openedAtUnread = useRef(false);
  useLayoutEffect(() => {
    if (openedAtUnread.current) return;
    openedAtUnread.current = true;
    const el = scrollRef.current;
    const divider = el?.querySelector<HTMLElement>("#unread-divider");
    if (!el || !divider) return;
    const top = divider.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 12;
    if (el.scrollHeight - top > el.clientHeight) {
      stickRef.current = false;
      el.scrollTop = top;
      setAtBottom(false);
    }
  }, []);

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

  // The message whose menu is open got unsent by them → close the menu.
  const pickedGone = !!pickerFor && !!messages.find((m) => m.id === pickerFor)?.deleted_at;
  useEffect(() => {
    if (pickedGone) setPickerFor(null);
  }, [pickedGone]);

  useEffect(() => {
    if (!props.prefill) return;
    setText(props.prefill.text);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.prefill]);

  // Search result picked → scroll there once it's rendered.
  useEffect(() => {
    if (!props.jumpRequest) return;
    stickRef.current = false;
    const id = props.jumpRequest.id;
    const t = setTimeout(() => jumpTo(id), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.jumpRequest]);

  function jumpTo(id: string) {
    const target = document.getElementById(`msg-${id}`);
    if (!target) return;
    centerIn(scrollRef.current, target);
    setFlashId(id);
    setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1400);
  }

  function startReply(m: Message) {
    setReplyTo(m);
    setPickerFor(null);
    navigator.vibrate?.(10);
    inputRef.current?.focus();
  }

  function startEdit(m: Message) {
    setEditing(m);
    setReplyTo(null);
    setPickerFor(null);
    setText(m.body);
    inputRef.current?.focus();
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim()) return;
    if (editing) {
      if (text.trim() !== editing.body) props.onEdit?.(editing.id, text);
      setEditing(null);
      setText("");
      return;
    }
    props.onSend(text, replyTo?.id ?? null);
    props.onTyping(false);
    setText("");
    setReplyTo(null);
    stickRef.current = true;
    setUnseenBelow(0);
  }

  // "N unread messages" divider, WhatsApp-style (fixed at what was unread when you opened the room).
  const since = props.unreadSince ? parseTimestamp(props.unreadSince) : null;
  const firstUnread = since == null ? -1 : messages.findIndex((m) => m.user_id !== meId && m.kind !== "system" && parseTimestamp(m.created_at) > since);
  const unreadCount = firstUnread < 0 ? 0 : messages.slice(firstUnread).filter((m) => m.user_id !== meId && m.kind !== "system").length;

  // Group reactions by message.
  const byMessage: Record<string, Reaction[]> = {};
  for (const r of Object.values(reactions)) {
    if (!r.emoji) continue;
    (byMessage[r.message_id] ??= []).push(r);
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col">
      {props.topBar}
      {props.banner && <div className="flex flex-wrap justify-center gap-1.5 px-3 pt-1 pb-1 empty:hidden">{props.banner}</div>}
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
              {i === firstUnread && (
                <div id="unread-divider" className="my-3 flex justify-center">
                  <span className="rounded-full bg-rose-300/15 px-3 py-1 text-[11.5px] font-semibold text-rose-100 ring-1 ring-rose-200/20">
                    {unreadCount} unread message{unreadCount === 1 ? "" : "s"}
                  </span>
                </div>
              )}
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
                onClosePicker={() => setPickerFor(null)}
                onReply={() => startReply(m)}
                onCopy={
                  m.kind === "text" && !m.deleted_at
                    ? () => {
                        setPickerFor(null);
                        navigator.clipboard?.writeText(m.body).then(
                          () => props.onError?.("📋 Copied"),
                          () => props.onError?.("Couldn't copy"),
                        );
                      }
                    : undefined
                }
                onEdit={props.v2 && mine && canEditMsg(m) ? () => startEdit(m) : undefined}
                onUnsend={
                  props.v2 && mine && !m.deleted_at && !m.pending
                    ? () => {
                        setPickerFor(null);
                        if (confirm("Unsend this message for both of you?")) props.onUnsend?.(m.id);
                      }
                    : undefined
                }
                onPlay={props.onPlayFromMessage ? () => props.onPlayFromMessage!(m) : undefined}
                onPlayTrack={props.onPlayTrack ? (t) => props.onPlayTrack!(t, m.user_id) : undefined}
                onRetry={m.failed && props.onRetry ? () => props.onRetry!(m) : undefined}
                onPin={
                  props.onPin && !m.deleted_at && !m.pending
                    ? () => {
                        setPickerFor(null);
                        props.onPin!(m.id);
                      }
                    : undefined
                }
                pinned={props.pinnedId === m.id}
                poll={
                  m.kind === "poll"
                    ? { votes: (props.votes ?? []).filter((v) => v.message_id === m.id), meId, nameOf: props.nameOf, onVote: props.onVote ? (c) => props.onVote!(m.id, c) : undefined }
                    : undefined
                }
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
            {firstName(partner.name)} is {partnerTyping === "recording" ? "recording a voice note 🎙️" : "typing…"}
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
        {editing && (
          <div className="animate-rise mb-2 flex items-center gap-3 rounded-2xl bg-white/7 py-2 pr-2 pl-3 ring-1 ring-white/10">
            <div className="min-w-0 flex-1 border-l-2 border-sky-300 pl-2.5">
              <div className="text-xs font-semibold text-sky-200">Editing message</div>
              <div className="truncate text-[13px] text-cream/70">{editing.body}</div>
            </div>
            <button
              onClick={() => {
                setEditing(null);
                setText("");
              }}
              aria-label="Cancel edit"
              className="rounded-full p-1.5 text-cream/60 hover:bg-white/10"
            >
              <XIcon size={16} />
            </button>
          </div>
        )}
        {stickers && (
          <div className="animate-rise mb-2 grid grid-cols-8 gap-1 rounded-2xl bg-zinc-900/90 p-2 ring-1 ring-white/10">
            {STICKERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  props.onSticker?.(s);
                  setStickers(false);
                }}
                className="flex aspect-square items-center justify-center rounded-xl text-3xl transition hover:bg-white/10 active:scale-90"
                aria-label={`Send ${s} sticker`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
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
        {recording ? (
          <VoiceRecorder
            onCancel={() => {
              setRecording(false);
              props.onTyping(false);
            }}
            onError={(msg) => props.onError?.(msg)}
            onTick={() => props.onTyping(true, true)}
            onDone={(blob, secs, mime, peaks) => {
              setRecording(false);
              props.onTyping(false);
              props.onVoice?.(blob, secs, mime, peaks);
            }}
          />
        ) : (
        <form onSubmit={submit} className="flex items-end gap-2">
          <BurstButton onBurst={props.onBurst} />
          {props.v2 && (
            <div className="relative shrink-0">
              {more && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMore(false)} />
                  <div className="animate-pop absolute bottom-13 left-0 z-40 w-44 overflow-hidden rounded-2xl bg-zinc-900/95 py-1.5 text-sm shadow-xl ring-1 ring-white/10">
                    <button
                      type="button"
                      aria-label="Stickers"
                      onClick={() => {
                        setMore(false);
                        setStickers((v) => !v);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/8"
                    >
                      😊 <span>Stickers</span>
                    </button>
                    <button
                      type="button"
                      aria-label="Send a photo"
                      onClick={() => {
                        setMore(false);
                        photoRef.current?.click();
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/8"
                    >
                      📷 <span>Photo</span>
                    </button>
                    {props.onPoll && (
                      <button
                        type="button"
                        aria-label="Poll"
                        onClick={() => {
                          setMore(false);
                          props.onPoll!();
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/8"
                      >
                        📊 <span>Poll</span>
                      </button>
                    )}
                  </div>
                </>
              )}
              <button
                type="button"
                onClick={() => setMore((v) => !v)}
                aria-label="More"
                className={`flex size-11 items-center justify-center rounded-full text-2xl leading-none ring-1 ring-white/10 transition active:scale-90 ${more || stickers ? "bg-white/20" : "bg-white/8"}`}
              >
                +
              </button>
              <input
                ref={photoRef}
                type="file"
                accept="image/*"
                aria-label="Photo file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) props.onPhoto?.(f);
                }}
              />
            </div>
          )}
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
              if (e.key === "Escape") {
                setReplyTo(null);
                if (editing) {
                  setEditing(null);
                  setText("");
                }
              }
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={partner ? `Message ${firstName(partner.name)}…` : "Message…"}
            enterKeyHint="send"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl bg-white/8 px-4 py-2.5 text-base leading-6 ring-1 ring-white/10 [field-sizing:content] placeholder:text-cream/35 focus:ring-white/25 focus:outline-none"
          />
          {props.v2 && !text.trim() && !editing && canRecord ? (
            <button
              type="button"
              onClick={() => setRecording(true)}
              aria-label="Record voice note"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-cream text-lg text-ink transition active:scale-90"
            >
              🎙️
            </button>
          ) : (
            <button
              type="submit"
              disabled={!text.trim()}
              aria-label="Send"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-cream text-ink transition active:scale-90 disabled:opacity-30"
            >
              <SendIcon size={18} />
            </button>
          )}
        </form>
        )}
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
  onClosePicker: () => void;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onCopy?: () => void;
  onEdit?: () => void;
  onUnsend?: () => void;
  onPlay?: () => void;
  onPlayTrack?: (t: Track) => void;
  onRetry?: () => void;
  poll?: PollInfo;
  onPin?: () => void;
  pinned?: boolean;
};

type PollInfo = { votes: PollVote[]; meId: string; nameOf: (id: string | null | undefined) => string; onVote?: (choice: number) => void };

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
  onClosePicker,
  onReply,
  onReact,
  onCopy,
  onEdit,
  onUnsend,
  onPlay,
  onPlayTrack,
  onRetry,
  poll,
  onPin,
  pinned,
}: BubbleProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const swiping = useRef(false);
  const suppressClick = useRef(false); // a long-press / swipe shouldn't also count as a tap
  const lastTap = useRef(0);
  const [pressing, setPressing] = useState(false);
  const [dx, setDx] = useState(0);
  const bubbleRef = useRef<HTMLDivElement>(null);
  // Stickers and emoji-only messages sit on the background, no bubble.
  const bare = !m.deleted_at && (m.kind === "sticker" || (m.kind === "text" && !m.reply_to && bigEmojiCount(m.body) > 0));

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
      suppressClick.current = false;
      timer.current = setTimeout(() => {
        suppressClick.current = true;
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
          suppressClick.current = true;
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
          <MessageMenu
            anchor={bubbleRef.current}
            mine={mine}
            myReaction={myReaction}
            onReact={onReact}
            onClose={onClosePicker}
            actions={[
              { label: "Reply", icon: <ReplyIcon size={15} />, run: onReply },
              ...(onCopy ? [{ label: "Copy", icon: "📋", run: onCopy }] : []),
              ...(onPin ? [{ label: pinned ? "Unpin" : "Pin", icon: "📌", run: onPin }] : []),
              ...(onEdit ? [{ label: "Edit", icon: "✏️", run: onEdit }] : []),
              ...(onUnsend ? [{ label: "Unsend", icon: "🗑️", run: onUnsend, danger: true }] : []),
            ]}
          />
        )}
        <div
          ref={bubbleRef}
          {...handlers}
          onClickCapture={(e) => {
            if (suppressClick.current) {
              suppressClick.current = false;
              e.stopPropagation();
              e.preventDefault();
            }
          }}
          style={{ WebkitTouchCallout: "none", touchAction: "pan-y" }}
          className={`relative text-[15px] leading-snug break-words whitespace-pre-wrap transition-[transform,box-shadow] duration-200 select-none ${
            pressing ? "scale-[0.97]" : ""
          } ${flash ? "ring-2 ring-rose-300" : ""} ${
            bare
              ? "rounded-3xl px-1 py-0.5"
              : `px-3.5 py-2 ${mine
              ? `bg-gradient-to-br from-rose-300 to-orange-200 text-ink ${tail ? "rounded-3xl rounded-br-md" : "rounded-3xl"}`
              : `bg-[#2c2329]/95 text-cream ring-1 ring-white/10 ${tail ? "rounded-3xl rounded-bl-md" : "rounded-3xl"}`}`
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
          <MessageBody m={m} mine={mine} authorName={authorName} onPlay={onPlay} onPlayTrack={onPlayTrack} poll={poll} />
          <span
            className={`ml-2 inline-flex translate-y-[3px] items-center gap-0.5 align-baseline text-[10px] ${
              mine && !bare ? "text-ink/55" : "text-cream/40"
            }`}
          >
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
      {onRetry && (
        <button onClick={onRetry} className="mt-1 rounded-full px-2 py-0.5 text-[12px] font-medium text-rose-300 active:bg-white/10">
          ⚠️ Not sent · Tap to retry
        </button>
      )}
    </div>
  );
}

/** Tap: ❤️ burst on both screens. Long-press: pick another emoji. */
function BurstButton({ onBurst }: { onBurst: (emoji: string) => void }) {
  const [tray, setTray] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  return (
    <div className="relative shrink-0">
      {tray && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setTray(false)} />
          <div className="animate-pop absolute bottom-13 left-0 z-40 flex gap-1 rounded-full bg-zinc-900/95 p-1.5 shadow-xl ring-1 ring-white/10">
            {BURST_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onBurst(e)}
                className="flex size-10 items-center justify-center rounded-full text-2xl transition hover:scale-125 active:scale-90"
              >
                {e}
              </button>
            ))}
          </div>
        </>
      )}
      <button
        type="button"
        aria-label="Send a heart burst (hold for more)"
        onPointerDown={() => {
          longPressed.current = false;
          timer.current = setTimeout(() => {
            longPressed.current = true;
            navigator.vibrate?.(10);
            setTray(true);
          }, 420);
        }}
        onPointerUp={() => timer.current && clearTimeout(timer.current)}
        onPointerLeave={() => timer.current && clearTimeout(timer.current)}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (longPressed.current) return;
          onBurst("❤️");
        }}
        className="flex size-11 items-center justify-center rounded-full bg-white/8 text-xl ring-1 ring-white/10 transition select-none active:scale-90"
      >
        ❤️
      </button>
    </div>
  );
}

/** What's inside a bubble, by message kind. */
function MessageBody({
  m,
  mine,
  authorName,
  onPlay,
  onPlayTrack,
  poll,
}: {
  m: Message;
  mine: boolean;
  authorName: string;
  onPlay?: () => void;
  onPlayTrack?: (t: Track) => void;
  poll?: PollInfo;
}) {
  if (m.deleted_at) return <span className="italic opacity-60">🚫 Message deleted</span>;
  const meta = m.meta ?? {};
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  if (m.kind === "image") return <ImageMessage m={m} />;
  if (m.kind === "poll" && meta.options && poll) return <PollCard question={m.body} options={meta.options} mine={mine} poll={poll} />;
  if (m.kind === "voice") return <VoiceMessage m={m} mine={mine} />;

  if (m.kind === "sticker" && meta.miss) {
    return (
      <span className="flex flex-col items-center gap-1 px-2">
        <span className="animate-pop inline-block text-6xl leading-none drop-shadow-lg">🥹</span>
        <span className="rounded-full bg-black/35 px-2.5 py-0.5 text-[12px] font-medium text-rose-100">
          {mine ? "You miss them" : `${authorName} misses you`}
        </span>
      </span>
    );
  }

  if (m.kind === "sticker") {
    return <span className="inline-block text-6xl leading-none drop-shadow-lg">{meta.sticker ?? m.body}</span>;
  }

  if ((m.kind === "moment" || m.kind === "dedication") && meta.videoId) {
    const isMoment = m.kind === "moment";
    return (
      <span className="block w-60 max-w-full whitespace-normal">
        <span className={`mb-1.5 block text-[11.5px] font-semibold tracking-wide uppercase ${mine ? "text-ink/60" : "text-rose-200/90"}`}>
          {isMoment ? "🎵 A moment in the song" : `💌 ${mine ? "You" : authorName} dedicated a song`}
        </span>
        <span className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrl(meta.videoId)} alt="" className="h-11 w-[4.4rem] shrink-0 rounded-lg bg-white/10 object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
          <span className="min-w-0">
            <span className="line-clamp-2 block text-[14px] leading-snug font-semibold">{meta.title}</span>
            <span className={`block text-xs ${mine ? "text-ink/60" : "text-cream/55"}`}>
              {isMoment ? `at ${formatTime(meta.at ?? 0)}` : meta.channel}
            </span>
          </span>
        </span>
        {!isMoment && meta.note && (
          <span className={`mt-2 block font-display text-[15px] leading-snug italic ${mine ? "text-ink/85" : "text-cream/90"}`}>“{meta.note}”</span>
        )}
        {onPlay && (
          <button
            type="button"
            onPointerDown={stop}
            onClick={onPlay}
            className={`mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-semibold ${
              mine ? "bg-ink/12 text-ink" : "bg-white/12 text-cream"
            } active:scale-[0.98]`}
          >
            ▶ {isMoment ? `Play from ${formatTime(meta.at ?? 0)}` : "Play it together"}
          </button>
        )}
      </span>
    );
  }

  const big = m.kind === "text" && !m.reply_to ? bigEmojiCount(m.body) : 0;
  if (big) return <span className={`inline-block leading-none drop-shadow-lg ${big === 1 ? "text-6xl" : big === 2 ? "text-5xl" : "text-4xl"}`}>{m.body.trim()}</span>;

  const ytId = m.kind === "text" ? parseYouTubeId(m.body) : null;
  return (
    <>
      {m.body}
      {m.edited_at && <span className={`ml-1.5 text-[10px] ${mine ? "text-ink/50" : "text-cream/40"}`}>edited</span>}
      {ytId && onPlayTrack && <LinkCard videoId={ytId} mine={mine} onPlay={onPlayTrack} />}
    </>
  );
}

type MenuItem = { label: string; icon: React.ReactNode; run: () => void; danger?: boolean };

/**
 * Long-press menu, WhatsApp-style: the chat dims, the message stays lit, reactions float
 * above it and actions below — always kept inside the screen.
 */
function MessageMenu({
  anchor,
  mine,
  myReaction,
  onReact,
  onClose,
  actions,
}: {
  anchor: HTMLElement | null;
  mine: boolean;
  myReaction: string | null;
  onReact: (e: string) => void;
  onClose: () => void;
  actions: MenuItem[];
}) {
  const [pos, setPos] = useState<{ emojiTop: number; actTop: number; x: number; rect: DOMRect; html: string } | null>(null);
  // Esc closes it (computers).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const vw = window.innerWidth;
    const EMOJI = 48, GAP = 8, ACT = actions.length * 44 + 10;
    let emojiTop = r.top - EMOJI - GAP;
    let actTop = r.bottom + GAP;
    if (emojiTop < GAP) {
      emojiTop = r.bottom + GAP;
      actTop = emojiTop + EMOJI + GAP;
    }
    if (actTop + ACT > vh - GAP) {
      // Not enough room below: stack actions above the reactions.
      actTop = Math.max(GAP, emojiTop - ACT - GAP);
      if (emojiTop + EMOJI > vh - GAP) emojiTop = vh - EMOJI - GAP;
    }
    setPos({ emojiTop, actTop, x: mine ? Math.max(GAP, vw - r.right) : Math.max(GAP, r.left), rect: r, html: anchor.outerHTML });
  }, [anchor, mine, actions.length]);

  if (!pos) return null;
  const side = mine ? { right: pos.x } : { left: pos.x };
  // Rendered at page level (a parent's animation would otherwise trap "fixed" inside the row).
  return createPortal(
    <div
      className="fixed inset-0 z-[65] bg-black/45 transition-opacity"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* The message itself, lit up above the dimmed chat */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{ top: pos.rect.top, left: pos.rect.left, width: pos.rect.width }}
        dangerouslySetInnerHTML={{ __html: pos.html }}
      />
      <div
        className="animate-pop absolute flex items-center gap-0.5 rounded-full bg-zinc-900/95 p-1 shadow-2xl ring-1 ring-white/10"
        style={{ top: pos.emojiTop, ...side }}
        onClick={(e) => e.stopPropagation()}
      >
        {EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => onReact(e)}
            className={`flex size-10 items-center justify-center rounded-full text-[22px] transition hover:scale-125 active:scale-95 ${myReaction === e ? "bg-white/15" : ""}`}
          >
            {e}
          </button>
        ))}
      </div>
      <div
        className="animate-pop absolute w-48 overflow-hidden rounded-2xl bg-zinc-900/95 py-1 shadow-2xl ring-1 ring-white/10"
        style={{ top: pos.actTop, ...side }}
        onClick={(e) => e.stopPropagation()}
      >
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={a.run}
            aria-label={a.label}
            className={`flex h-11 w-full items-center justify-between px-4 text-[15px] hover:bg-white/8 active:bg-white/12 ${a.danger ? "text-rose-300" : "text-cream/90"}`}
          >
            {a.label}
            <span className="text-base leading-none">{a.icon}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

/** A YouTube link in a message → the song, with "Play it together". */
function LinkCard({ videoId, mine, onPlay }: { videoId: string; mine: boolean; onPlay: (t: Track) => void }) {
  const [track, setTrack] = useState<Track | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`/api/oembed?id=${videoId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => alive && setTrack(j.items?.[0] ?? null))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [videoId]);
  if (failed) return null;
  return (
    <span className={`mt-2 block w-60 max-w-full overflow-hidden rounded-2xl whitespace-normal ${mine ? "bg-ink/10" : "bg-black/25"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt="" className="aspect-video w-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
      <span className="block px-3 pt-2 pb-2.5">
        <span className="line-clamp-2 block text-[13.5px] leading-snug font-semibold">{track?.title ?? "YouTube"}</span>
        {track && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onPlay(track)}
            className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-semibold active:scale-[0.98] ${
              mine ? "bg-ink/15 text-ink" : "bg-white/12 text-cream"
            }`}
          >
            ▶ Play it together
          </button>
        )}
      </span>
    </span>
  );
}

/** Poll card: tap a choice to vote (tap again to take it back). Live on both phones. */
function PollCard({ question, options, mine, poll }: { question: string; options: string[]; mine: boolean; poll: PollInfo }) {
  const total = poll.votes.length;
  const myChoice = poll.votes.find((v) => v.user_id === poll.meId)?.choice;
  return (
    <span className="block w-64 max-w-full whitespace-normal">
      <span className={`mb-1 block text-[11.5px] font-semibold tracking-wide uppercase ${mine ? "text-ink/60" : "text-rose-200/90"}`}>📊 Poll</span>
      <span className="block text-[15.5px] leading-snug font-semibold">{question}</span>
      <span className="mt-2.5 block space-y-1.5">
        {options.map((o, i) => {
          const voters = poll.votes.filter((v) => v.choice === i);
          const pct = total ? Math.round((voters.length / total) * 100) : 0;
          const chosen = myChoice === i;
          return (
            <button
              key={i}
              type="button"
              disabled={!poll.onVote}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => poll.onVote?.(i)}
              aria-pressed={chosen}
              aria-label={`Vote ${o}`}
              className={`relative block w-full overflow-hidden rounded-xl px-3 py-2 text-left text-[14px] ring-1 transition active:scale-[0.98] ${
                mine ? "ring-ink/15" : "ring-white/10"
              } ${chosen ? (mine ? "ring-2 ring-ink/50" : "ring-2 ring-rose-200/70") : ""}`}
            >
              <span className={`absolute inset-y-0 left-0 transition-[width] duration-500 ${mine ? "bg-ink/12" : "bg-white/12"}`} style={{ width: `${pct}%` }} />
              <span className="relative flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  {chosen ? "✓ " : ""}
                  {o}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[12px] opacity-70">
                  {voters.map((v) => (
                    <span key={v.user_id} title={poll.nameOf(v.user_id)}>
                      {v.user_id === poll.meId ? "You" : poll.nameOf(v.user_id)}
                    </span>
                  ))}
                </span>
              </span>
            </button>
          );
        })}
      </span>
      <span className={`mt-1.5 block text-[11px] ${mine ? "text-ink/55" : "text-cream/45"}`}>
        {total === 0 ? "Tap to vote" : total === 1 ? "1 vote · waiting for the other" : "Both voted"}
      </span>
    </span>
  );
}
