import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeUsername, pinConfigured, pinToSecret, PIN_RE, USERNAME_RE, waitText } from "@/lib/pin";

export async function POST(req: NextRequest) {
  if (!pinConfigured()) return NextResponse.json({ error: "PIN login isn't set up on the server yet." }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const username = normalizeUsername(body.username);
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!USERNAME_RE.test(username) || !PIN_RE.test(pin)) {
    return NextResponse.json({ error: "Enter your Duet ID and 4-digit PIN." }, { status: 400 });
  }

  const supabase = await createClient();
  const secret = pinToSecret(pin);

  // Lockout + PIN check happen inside the database.
  const { data, error } = await supabase.rpc("pin_login_check", { p_username: username, p_secret: secret });
  if (error) return NextResponse.json({ error: "Login is unavailable right now." }, { status: 500 });

  const result = data as { ok: boolean; error?: string; email?: string; retry_after?: number; tries_left?: number };
  if (!result.ok) {
    if (result.error === "LOCKED") {
      return NextResponse.json({ error: `Too many wrong tries. Try again in ${waitText(result.retry_after ?? 900)}.` }, { status: 429 });
    }
    const left = result.tries_left ?? 0;
    return NextResponse.json(
      { error: `Wrong Duet ID or PIN.${left > 0 && left < 5 ? ` ${left} ${left === 1 ? "try" : "tries"} left.` : ""}` },
      { status: 401 },
    );
  }

  // Correct → create the real session (sets the login cookies on this response).
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: result.email!, password: secret });
  if (signInError) return NextResponse.json({ error: "Couldn't sign you in — try the email code instead." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
