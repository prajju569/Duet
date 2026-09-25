"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type JoinState = { error: string | null };

const ERRORS: Record<string, string> = {
  INVITE_USED: "This invite was already used.",
  INVITE_EXPIRED: "This invite has expired — ask for a new link.",
  INVITE_INVALID: "This invite link isn't valid.",
  ROOM_FULL: "That room already has two people in it.",
};

/** Tapping "Join": make an account if needed, sign in, accept the invite, open the room. */
export async function joinWithInvite(token: string): Promise<JoinState> {
  const supabase = await createClient();

  // Don't create anything for a dead link.
  const { data: preview } = await supabase.rpc("invite_preview", { p_token: token });
  const status = (preview as { status?: string } | null)?.status;
  if (status !== "ok" && !(preview as { used_by_me?: boolean } | null)?.used_by_me) {
    return { error: ERRORS[`INVITE_${(status ?? "invalid").toUpperCase()}`] ?? ERRORS.INVITE_INVALID };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const admin = createAdminClient();
    if (!admin) return { error: "Invites aren't set up on the server yet (missing service key)." };
    // A private, email-less account. They can add a username + PIN later to log in elsewhere.
    const email = `guest-${randomUUID()}@guests.duet.local`;
    const password = randomBytes(24).toString("base64url");
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { via: "invite" },
    });
    if (createError) return { error: `Couldn't create your account: ${createError.message}` };
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) return { error: `Couldn't sign you in: ${signInError.message}` };
  }

  const { data: code, error } = await supabase.rpc("redeem_invite", { p_token: token });
  if (error || !code) {
    const key = Object.keys(ERRORS).find((k) => error?.message.includes(k));
    return { error: key ? ERRORS[key] : "Couldn't join — try the link again." };
  }
  redirect(`/room/${code}?welcome=1`);
}
