"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { BackIcon, HeadphonesIcon, LinkIcon } from "@/components/ui/Icons";
import { firstName } from "@/lib/format";
import type { Member, PresenceInfo } from "@/lib/types";

type Props = {
  roomName: string;
  code: string;
  me: { id: string; name: string };
  partner: Member | null;
  presence: Record<string, PresenceInfo>;
  /** Opens the "type their name" invite sheet (only while the second seat is empty). */
  onInvite: () => void;
  onRename: () => void;
  onNudge: () => void;
  /** 🥹 "missing you" — posts a card in chat and buzzes their phone */
  onMissYou?: () => void;
  /** v2 extras (menu entries appear only when provided) */
  onTheme?: () => void;
  onSchedule?: () => void;
  togetherText?: string | null;
  push?: { status: string; toggle: () => void } | null;
};

function Person({ userId, name, presence, isMe }: { userId: string; name: string; presence?: PresenceInfo; isMe?: boolean }) {
  const online = !!presence;
  const status = presence?.listening ? "listening now" : online ? "online" : "offline";
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar userId={userId} name={name} size={30} online={online} />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[13px] font-medium">{isMe ? "You" : firstName(name)}</div>
        <div className={`flex items-center gap-1 text-[11px] ${presence?.listening ? "text-rose-200" : "text-cream/50"}`}>
          {presence?.listening && <HeadphonesIcon size={11} className="animate-pulse" />}
          {status}
        </div>
      </div>
    </div>
  );
}

export function TopBar({ roomName, code, me, partner, presence, onInvite, onRename, onNudge, onMissYou, onTheme, onSchedule, togetherText, push }: Props) {
  const [copied, setCopied] = useState(false);
  const [menu, setMenu] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <header className="flex items-center gap-3 px-4 pt-[max(env(safe-area-inset-top),10px)] pb-2.5">
      <Link href="/" aria-label="All rooms" className="-ml-1.5 rounded-full p-1.5 text-cream/60 hover:bg-white/5 hover:text-cream">
        <BackIcon size={18} />
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {partner ? (
          <Person userId={partner.userId} name={partner.name} presence={presence[partner.userId]} />
        ) : (
          <div className="min-w-0 leading-tight">
            <div className="truncate font-display text-[15px] italic">{roomName}</div>
            <div className="text-[11px] text-cream/50">waiting for your person…</div>
          </div>
        )}
        <div className="hidden sm:block">
          <Person userId={me.id} name={me.name} presence={presence[me.id]} isMe />
        </div>
      </div>
      {partner && onMissYou && (
        <button
          onClick={onMissYou}
          aria-label={`Tell ${firstName(partner.name)} you miss them`}
          title="Missing you"
          className="flex size-8 items-center justify-center rounded-full text-base ring-1 ring-white/10 transition hover:bg-white/10 active:scale-90"
        >
          🥹
        </button>
      )}
      {partner && (
        <button
          onClick={onNudge}
          aria-label={`Tell ${firstName(partner.name)} you're thinking of them`}
          title="Thinking of you"
          className="flex size-8 items-center justify-center rounded-full text-base ring-1 ring-white/10 transition hover:bg-white/10 active:scale-90"
        >
          💭
        </button>
      )}
      {!partner && (
        <button
          onClick={onInvite}
          className="flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-1.5 text-xs font-medium text-cream/85 ring-1 ring-white/10 transition hover:bg-white/15 active:scale-95"
        >
          <LinkIcon size={13} />
          Invite
        </button>
      )}
      <div className="relative">
        <button
          onClick={() => setMenu((m) => !m)}
          aria-label="Room options"
          className="flex size-8 items-center justify-center rounded-full text-cream/70 ring-1 ring-white/10 hover:bg-white/10"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
            <div className="animate-pop absolute top-10 right-0 z-50 w-56 overflow-hidden rounded-2xl bg-zinc-900/95 py-1.5 text-sm shadow-2xl ring-1 ring-white/10 backdrop-blur">
              <div className="px-4 pt-1.5 pb-2">
                <div className="truncate font-display text-base text-cream/90 italic">{roomName}</div>
                {togetherText && <div className="text-[11px] text-rose-200/80">🎧 {togetherText} listening together</div>}
              </div>
              <button
                onClick={() => {
                  setMenu(false);
                  onRename();
                }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/8"
              >
                ✏️ <span>Rename room</span>
              </button>
              {!partner && (
                <button
                  onClick={() => {
                    setMenu(false);
                    onInvite();
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/8"
                >
                  💌 <span>Invite someone</span>
                </button>
              )}
              <button onClick={copyCode} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/8">
                🔑 <span>{copied ? "Copied ✓" : `Copy room code · ${code}`}</span>
              </button>
              {onTheme && (
                <button
                  onClick={() => {
                    setMenu(false);
                    onTheme();
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/8"
                >
                  🎨 <span>Theme</span>
                </button>
              )}
              {onSchedule && (
                <button
                  onClick={() => {
                    setMenu(false);
                    onSchedule();
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/8"
                >
                  ⏰ <span>Schedule a song</span>
                </button>
              )}
              {push && (
                <button
                  onClick={() => {
                    setMenu(false);
                    push.toggle();
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/8"
                >
                  {push.status === "on" ? "🔔" : "🔕"}{" "}
                  <span>
                    Notifications: <b>{push.status === "on" ? "On" : push.status === "blocked" ? "Blocked" : "Off"}</b>
                  </span>
                </button>
              )}
              <Link href="/" className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-white/8">
                🏠 <span>All rooms</span>
              </Link>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
