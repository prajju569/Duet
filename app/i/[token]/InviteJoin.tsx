"use client";

import { useState, useTransition } from "react";
import { PinInput } from "@/components/ui/PinInput";
import { checkDuetId, joinAsCurrent, joinAsExisting, joinAsNew, type ActionResult } from "./actions";

type Step = "id" | "new-pin" | "confirm-pin" | "existing-pin";

export function InviteJoin({ token, from, signedInAs }: { token: string; from: string; signedInAs: string | null }) {
  const [step, setStep] = useState<Step>("id");
  const [duetId, setDuetId] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [useOther, setUseOther] = useState(false);

  const run = (fn: () => Promise<ActionResult>, after?: (r: ActionResult) => void) =>
    start(async () => {
      setMsg(null);
      const r = await fn(); // on success the action redirects into the room
      if (r?.error) setMsg(r.error);
      else after?.(r);
    });

  // Already signed in on this phone.
  if (signedInAs && !useOther) {
    return (
      <div className="mt-8">
        <button
          disabled={pending}
          onClick={() => run(() => joinAsCurrent(token))}
          className="h-14 w-full rounded-2xl bg-cream text-lg font-semibold text-ink transition active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "Opening your room…" : `Join as ${signedInAs} 🎧`}
        </button>
        <button onClick={() => setUseOther(true)} className="mt-3 w-full py-2 text-sm text-cream/55">
          Not you? Use another Duet ID
        </button>
        {msg && <p className="mt-3 text-sm text-rose-300">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="mt-8 text-left">
      {step === "id" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => checkDuetId(token, duetId), (r) => setStep(r.exists ? "existing-pin" : "new-pin"));
          }}
        >
          <label className="block text-xs tracking-wide text-cream/50 uppercase">Your Duet ID</label>
          <input
            autoFocus
            value={duetId}
            onChange={(e) => setDuetId(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 20))}
            placeholder="e.g. moonrider.42"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            className="mt-1.5 h-13 w-full rounded-2xl bg-white/8 px-4 text-base ring-1 ring-white/10 placeholder:text-cream/35 focus:ring-white/30 focus:outline-none"
          />
          <p className="mt-2 text-xs text-cream/40">New here? Pick a secret ID — not your name (that is public). Already on Duet? Use your existing one.</p>
          <button
            disabled={pending || duetId.length < 3}
            className="mt-5 h-14 w-full rounded-2xl bg-cream text-lg font-semibold text-ink transition active:scale-[0.98] disabled:opacity-40"
          >
            {pending ? "Checking…" : "Continue"}
          </button>
        </form>
      )}

      {step === "new-pin" && (
        <div>
          <p className="text-center text-sm text-cream/70">
            <b className="text-cream">{duetId}</b> is yours. Create a 4-digit PIN — you&apos;ll use it to log in.
          </p>
          <div className="mt-5">
            <PinInput key="new" autoFocus value={pin} onChange={setPin} label="New PIN" onComplete={() => setStep("confirm-pin")} />
          </div>
        </div>
      )}

      {step === "confirm-pin" && (
        <div>
          <p className="text-center text-sm text-cream/70">Type the same PIN once more</p>
          <div className="mt-5">
            <PinInput
              key="confirm"
              autoFocus
              value={confirm}
              onChange={setConfirm}
              label="Confirm PIN"
              onComplete={(v) => {
                if (v !== pin) {
                  setMsg("PINs didn't match — try again.");
                  setPin("");
                  setConfirm("");
                  setStep("new-pin");
                  return;
                }
                run(() => joinAsNew(token, duetId, v), () => {});
              }}
            />
          </div>
          {pending && <p className="mt-4 text-center text-sm text-cream/60">Opening your room…</p>}
        </div>
      )}

      {step === "existing-pin" && (
        <div>
          <p className="text-center text-sm text-cream/70">
            Welcome back, <b className="text-cream">{duetId}</b>. Enter your PIN.
          </p>
          <div className="mt-5">
            <PinInput
              key="existing"
              autoFocus
              value={pin}
              onChange={setPin}
              label="Your PIN"
              onComplete={(v) => run(() => joinAsExisting(token, duetId, v), () => {})}
            />
          </div>
          {pending && <p className="mt-4 text-center text-sm text-cream/60">Opening your room…</p>}
        </div>
      )}

      {msg && (
        <p className="mt-4 text-center text-sm text-rose-300">
          {msg}
        </p>
      )}
      {step !== "id" && !pending && (
        <button
          onClick={() => {
            setStep("id");
            setPin("");
            setConfirm("");
            setMsg(null);
          }}
          className="mt-4 w-full py-2 text-sm text-cream/50"
        >
          ← Use a different Duet ID
        </button>
      )}
      {msg?.startsWith("Wrong PIN") && (
        <p className="text-center text-xs text-cream/40">Clear the boxes and try again.</p>
      )}
    </div>
  );
}
