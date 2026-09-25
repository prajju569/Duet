"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { PinInput } from "@/components/ui/PinInput";

export function LoginForm({ next, error }: { next: string; error?: string }) {
  const supabase = getSupabase();
  const router = useRouter();
  const [mode, setMode] = useState<"pin" | "email">(error ? "email" : "pin");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(error ? "That link expired or was already used — send a new one." : null);

  async function pinLogin(pinValue = pin) {
    if (busy || pinValue.length !== 6 || !username.trim()) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/pin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, pin: pinValue }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setPin("");
      return setMsg(json.error ?? "Couldn't sign in.");
    }
    router.replace(next);
    router.refresh();
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(false);
    if (error) {
      // Supabase returns this when "Allow new users to sign up" is off.
      const privateRoom = /signups? not allowed|not allowed for otp/i.test(error.message);
      setMsg(privateRoom ? "This Duet is private — ask the owner to let you in." : error.message);
    } else setSent(true);
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) return setMsg("That code didn't work — check it and try again.");
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="duet-bg relative flex min-h-dvh items-center justify-center overflow-hidden px-6">
      <div className="animate-rise relative z-10 w-full max-w-sm">
        <h1 className="font-display text-6xl italic">Duet</h1>
        <p className="mt-3 text-cream/65">A little room for two. Talk, and listen to the same song — at the same second.</p>

        {mode === "pin" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void pinLogin();
            }}
            className="mt-10 space-y-4"
          >
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
              placeholder="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="h-13 w-full rounded-2xl bg-white/8 px-4 text-base ring-1 ring-white/10 placeholder:text-cream/35 focus:ring-white/30 focus:outline-none"
            />
            <PinInput value={pin} onChange={setPin} onComplete={(v) => void pinLogin(v)} />
            <button
              disabled={busy || pin.length !== 6 || !username.trim()}
              className="h-13 w-full rounded-2xl bg-cream font-semibold text-ink transition active:scale-[0.98] disabled:opacity-40"
            >
              {busy ? "Opening Duet…" : "Enter Duet"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("email");
                setMsg(null);
              }}
              className="w-full py-2 text-sm text-cream/55"
            >
              First time here, or forgot your PIN? <span className="underline underline-offset-2">Use an email code</span>
            </button>
          </form>
        ) : (
          <>
        {!sent ? (
          <form onSubmit={sendLink} className="mt-10 space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="h-13 w-full rounded-2xl bg-white/8 px-4 text-base ring-1 ring-white/10 placeholder:text-cream/35 focus:ring-white/30 focus:outline-none"
            />
            <button disabled={busy} className="h-13 w-full rounded-2xl bg-cream font-semibold text-ink transition active:scale-[0.98] disabled:opacity-50">
              {busy ? "Sending…" : "Email me a login code"}
            </button>
          </form>
        ) : (
          <div className="mt-10">
            <div className="rounded-2xl bg-white/6 p-4 text-sm text-cream/80 ring-1 ring-white/10">
              ✉️ We sent a code to <b>{email}</b>. Type it below. (Check Spam if you don&apos;t see it.)
            </div>
            <form onSubmit={verifyCode} className="mt-4 space-y-3">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter code"
                autoFocus
                className="h-13 w-full rounded-2xl bg-white/8 px-4 text-center text-2xl tracking-[0.4em] ring-1 placeholder:tracking-normal placeholder:text-base ring-white/10 placeholder:text-cream/25 focus:ring-white/30 focus:outline-none"
              />
              <button disabled={busy || code.length < 6} className="h-13 w-full rounded-2xl bg-cream font-semibold text-ink transition active:scale-[0.98] disabled:opacity-40">
                {busy ? "Checking…" : "Sign in with code"}
              </button>
              <button type="button" onClick={() => setSent(false)} className="w-full py-2 text-sm text-cream/50">
                Use a different email
              </button>
            </form>
          </div>
        )}
            <button
              type="button"
              onClick={() => {
                setMode("pin");
                setMsg(null);
              }}
              className="mt-2 w-full py-2 text-sm text-cream/55"
            >
              ← Back to username &amp; PIN
            </button>
          </>
        )}
        {msg && <p className="mt-4 text-sm text-rose-300">{msg}</p>}
      </div>
    </div>
  );
}
