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
  connected: boolean;
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

export function TopBar({ roomName, code, me, partner, presence, connected }: Props) {
  const [copied, setCopied] = useState(false);

  async function invite() {
    const url = `${window.location.origin}/room/${code}`;
    const text = `Come listen with me on Duet 🎧 ${url}`;
    try {
      if (navigator.share) await navigator.share({ title: "Duet", text, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
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
      {!connected && <span className="text-[11px] text-amber-200/80">reconnecting…</span>}
      <button
        onClick={invite}
        className="flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-1.5 text-xs font-medium text-cream/85 ring-1 ring-white/10 transition hover:bg-white/15 active:scale-95"
      >
        <LinkIcon size={13} />
        {copied ? "Link copied" : partner ? code : "Invite"}
      </button>
    </header>
  );
}
