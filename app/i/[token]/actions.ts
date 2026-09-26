"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ID_NAME_MSG, idLooksLikeName } from "@/lib/duetId";
import { isWeakPin, normalizeUsername, pinConfigured, pinToSecret, PIN_RE, USERNAME_RE, waitText } from "@/lib/pin";

export type ActionResult = { error: string | null; exists?: boolean };

const INVITE_ERRORS: Record<string, string> = {
  INVITE_USED: "This invite was already used.",
  INVITE_EXPIRED: "This invite has expired — ask for a new link.",
  INVITE_INVALID: "This invite link isn't valid.",
  ROOM_FULL: "That room already has two people in it.",
  ROOM_CLOSED: "That room was closed — ask for a new invite.",
};

async function inviteIsOpen(token: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("invite_preview", { p_token: token });
  const p = data as { status?: string; to?: string } | null;
  return { supabase, ok: p?.status === "ok", status: p?.status ?? "invalid", inviteeName: p?.to ?? null };
}

async function redeemAndGo(token: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: code, error } = await supabase.rpc("redeem_invite", { p_token: token });
  if (error || !code) {
    const key = Object.keys(INVITE_ERRORS).find((k) => error?.message.includes(k));
    return { error: key ? INVITE_ERRORS[key] : "Couldn't join — try the link again." };
  }
  redirect(`/room/${code}?welcome=1`);
}

/** Step 1: is this Duet ID new, or an existing account? */
export async function checkDuetId(token: string, rawId: string): Promise<ActionResult> {
  const id = normalizeUsername(rawId);
  if (!USERNAME_RE.test(id)) return { error: "Duet ID: 3–20 letters, numbers, _ or ." };
  const supabase = await createClient();
  const { data } = await supabase.rpc("invite_username_exists", { p_token: token, p_username: id });
  const r = data as { ok: boolean; exists?: boolean } | null;
  if (!r?.ok) return { error: INVITE_ERRORS.INVITE_INVALID };
  if (!r.exists) {
    const { inviteeName } = await inviteIsOpen(token);
    if (idLooksLikeName(id, inviteeName)) return { error: ID_NAME_MSG };
  }
  return { error: null, exists: !!r.exists };
}

/** New Duet ID: create the account with a 4-digit PIN, sign in, join the room. */
export async function joinAsNew(token: string, rawId: string, pin: string): Promise<ActionResult> {
  const id = normalizeUsername(rawId);
  if (!USERNAME_RE.test(id)) return { error: "Duet ID: 3–20 letters, numbers, _ or ." };
  if (!PIN_RE.test(pin)) return { error: "PIN must be 4 digits." };
  if (isWeakPin(pin)) return { error: "That PIN is too easy to guess — pick another." };
  if (!pinConfigured()) return { error: "PIN login isn't set up on the server yet." };

  const { supabase, ok, status, inviteeName } = await inviteIsOpen(token);
  if (!ok) return { error: INVITE_ERRORS[`INVITE_${status.toUpperCase()}`] ?? INVITE_ERRORS.INVITE_INVALID };
  if (idLooksLikeName(id, inviteeName)) return { error: ID_NAME_MSG };

  const admin = createAdminClient();
  if (!admin) return { error: "Invites aren't set up on the server yet (missing service key)." };

  // Email-less account: the Duet ID + PIN is the login. The address below never receives mail.
  const email = `guest-${randomUUID()}@guests.duet.local`;
  const password = pinToSecret(pin);
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { via: "invite" },
  });
  if (createError || !created.user) return { error: `Couldn't create your account: ${createError?.message}` };

  const { error: profileError } = await admin
    .from("profiles")
    .update({ username: id, display_name: inviteeName })
    .eq("id", created.user.id);
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id); // don't leave a half-made account behind
    return { error: profileError.code === "23505" ? "Someone just took that Duet ID — try another." : profileError.message };
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return { error: `Couldn't sign you in: ${signInError.message}` };
  return redeemAndGo(token);
}

/** Existing Duet ID: check the PIN (with lockout), sign in, join the room. */
export async function joinAsExisting(token: string, rawId: string, pin: string): Promise<ActionResult> {
  const id = normalizeUsername(rawId);
  if (!PIN_RE.test(pin)) return { error: "PIN must be 4 digits." };
  if (!pinConfigured()) return { error: "PIN login isn't set up on the server yet." };

  const { supabase, ok, status } = await inviteIsOpen(token);
  if (!ok) return { error: INVITE_ERRORS[`INVITE_${status.toUpperCase()}`] ?? INVITE_ERRORS.INVITE_INVALID };

  const secret = pinToSecret(pin);
  const { data } = await supabase.rpc("pin_login_check", { p_username: id, p_secret: secret });
  const r = data as { ok: boolean; error?: string; email?: string; retry_after?: number; tries_left?: number } | null;
  if (!r?.ok) {
    if (r?.error === "LOCKED") return { error: `Too many wrong tries. Try again in ${waitText(r.retry_after ?? 900)}.` };
    const left = r?.tries_left ?? 0;
    return { error: `Wrong PIN.${left > 0 && left < 5 ? ` ${left} ${left === 1 ? "try" : "tries"} left.` : ""}` };
  }
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: r.email!, password: secret });
  if (signInError) return { error: "Couldn't sign you in — try again." };
  return redeemAndGo(token);
}

/** Already signed in on this phone: just accept the invite. */
export async function joinAsCurrent(token: string): Promise<ActionResult> {
  return redeemAndGo(token);
}
