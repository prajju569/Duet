import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InviteJoin } from "./InviteJoin";

type Preview = { status: "ok" | "used" | "expired" | "invalid"; from?: string; to?: string; used_by_me?: boolean };

async function getPreview(token: string): Promise<Preview> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("invite_preview", { p_token: token });
  return (data as Preview) ?? { status: "invalid" };
}

// The card WhatsApp shows. Building it never touches the invite.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const p = await getPreview(token);
  const title = p.status === "ok" ? `${p.from} invited you to Duet 🎧` : "Duet — a room for two";
  const description = "Tap to join — chat and listen to the same song, at the same second.";
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: "/icon-512.png", width: 512, height: 512 }] },
    twitter: { card: "summary", title, description },
  };
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await getPreview(token);

  const supabase = await createClient();
  // Tapping your own (already used) link again just opens the room.
  if (p.status === "used" && p.used_by_me) {
    const { data: code } = await supabase.rpc("redeem_invite", { p_token: token });
    if (code) redirect(`/room/${code}`);
  }
  // Already signed in on this phone? Offer "Join as …".
  const { data: { user } } = await supabase.auth.getUser();
  let signedInAs: string | null = null;
  if (user) {
    const { data: me } = await supabase.from("profiles").select("display_name, username").eq("id", user.id).maybeSingle();
    signedInAs = me?.username ?? me?.display_name ?? "yourself";
  }

  return (
    <div className="duet-bg relative flex min-h-dvh items-center justify-center overflow-hidden px-6">
      <div className="animate-rise relative z-10 w-full max-w-sm text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" className="mx-auto size-20 rounded-[1.4rem] shadow-2xl ring-1 ring-white/10" />

        {p.status === "ok" ? (
          <>
            <p className="mt-8 text-cream/60">Hey {p.to} 👋</p>
            <h1 className="mt-2 font-display text-4xl leading-tight italic">{p.from} made a room for you two</h1>
            <p className="mt-4 text-cream/65">Chat, and listen to the same song — at the same second.</p>
            <InviteJoin token={token} from={p.from ?? "them"} signedInAs={signedInAs} />
          </>
        ) : (
          <>
            <h1 className="mt-8 font-display text-3xl italic">
              {p.status === "used" ? "This invite was already used" : p.status === "expired" ? "This invite has expired" : "This link isn't valid"}
            </h1>
            <p className="mt-4 text-cream/65">
              {p.status === "used"
                ? "If that was you on another phone, log in with your Duet ID + PIN."
                : "Ask for a fresh invite link — they only last 7 days."}
            </p>
            <Link href="/login" className="mt-8 inline-flex h-13 items-center rounded-2xl bg-cream px-8 font-semibold text-ink">
              Log in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
