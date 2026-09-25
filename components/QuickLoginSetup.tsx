"use client";

import { useState } from "react";
import { PinInput } from "@/components/ui/PinInput";

/** Pick a Duet ID + 4-digit PIN, so next time logging in takes two seconds. */
export function QuickLoginSetup({
  suggested,
  existingUsername,
  onDone,
  onSkip,
}: {
  suggested: string;
  existingUsername: string | null;
  onDone: (username: string) => void;
  onSkip?: () => void;
}) {
  const [username, setUsername] = useState(existingUsername ?? suggested);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [step, setStep] = useState<"pick" | "confirm">("pick");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(confirmValue: string) {
    if (confirmValue !== pin) {
      setMsg("PINs didn't match — try again.");
      setPin("");
      setConfirm("");
      setStep("pick");
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/pin/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, pin }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(json.error ?? "Couldn't save.");
      setPin("");
      setConfirm("");
      setStep("pick");
      return;
    }
    onDone(json.username);
  }

  return (
    <div className="animate-rise mt-8 rounded-3xl bg-white/6 p-5 ring-1 ring-white/10">
      <p className="font-display text-xl italic">{existingUsername ? "Change your PIN" : "Make logging in instant"}</p>
      <p className="mt-1 text-sm text-cream/60">
        {existingUsername
          ? "Pick a new 4-digit PIN. Your Duet ID can change too."
          : "Pick a Duet ID and a 4-digit PIN. Next time — on any phone — that's all you need. No emails."}
      </p>

      <label className="mt-5 block text-xs tracking-wide text-cream/50 uppercase">Duet ID</label>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 20))}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="username"
        placeholder="e.g. prajwal"
        className="mt-1.5 h-12 w-full rounded-2xl bg-white/8 px-4 text-base ring-1 ring-white/10 placeholder:text-cream/35 focus:ring-white/30 focus:outline-none"
      />

      <label className="mt-4 block text-xs tracking-wide text-cream/50 uppercase">
        {step === "pick" ? "Choose a 4-digit PIN" : "Type it once more"}
      </label>
      <div className="mt-1.5">
        {step === "pick" ? (
          <PinInput
            key="pick"
            value={pin}
            onChange={setPin}
            onComplete={() => {
              if (username.length < 3) return setMsg("Duet ID needs at least 3 characters.");
              setMsg(null);
              setStep("confirm");
            }}
          />
        ) : (
          <PinInput key="confirm" autoFocus value={confirm} onChange={setConfirm} onComplete={(v) => void save(v)} label="Confirm PIN" />
        )}
      </div>

      {busy && <p className="mt-3 text-sm text-cream/60">Saving…</p>}
      {msg && <p className="mt-3 text-sm text-rose-300">{msg}</p>}
      <p className="mt-4 text-xs text-cream/40">Avoid 0000 / 1234. Forgot it later? Log in with an email code and set a new one.</p>

      {onSkip && (
        <button onClick={onSkip} className="mt-3 text-sm text-cream/50 underline underline-offset-2">
          {existingUsername ? "Cancel" : "Skip for now"}
        </button>
      )}
    </div>
  );
}
