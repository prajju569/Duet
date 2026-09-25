import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeUsername, pinConfigured, pinToSecret, PIN_RE, USERNAME_RE } from "@/lib/pin";

// Set (or change) your username + PIN. You must already be signed in.
export async function POST(req: NextRequest) {
  if (!pinConfigured()) return NextResponse.json({ error: "PIN login isn't set up on the server yet." }, { status: 500 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const username = normalizeUsername(body.username);
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({ error: "Username: 3–20 letters, numbers, _ or ." }, { status: 400 });
  }
  if (!PIN_RE.test(pin)) return NextResponse.json({ error: "PIN must be exactly 6 digits." }, { status: 400 });
  if (/^(\d)\1{5}$/.test(pin) || pin === "123456" || pin === "654321") {
    return NextResponse.json({ error: "That PIN is too easy to guess — pick another." }, { status: 400 });
  }

  const { data: free } = await supabase.rpc("username_available", { p_username: username });
  if (free === false) return NextResponse.json({ error: "That username is taken." }, { status: 409 });

  // Username first: if the PIN step then fails, the old PIN still works with the new name.
  const { error: profileError } = await supabase.from("profiles").update({ username }).eq("id", user.id);
  if (profileError) {
    const taken = profileError.code === "23505";
    return NextResponse.json({ error: taken ? "That username is taken." : profileError.message }, { status: taken ? 409 : 400 });
  }

  const { error: pwError } = await supabase.auth.updateUser({ password: pinToSecret(pin) });
  if (pwError) return NextResponse.json({ error: `Couldn't save your PIN: ${pwError.message}` }, { status: 400 });

  return NextResponse.json({ ok: true, username });
}
