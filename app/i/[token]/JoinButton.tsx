"use client";

import { useActionState } from "react";
import { joinWithInvite, type JoinState } from "./actions";

export function JoinButton({ token, from }: { token: string; from: string }) {
  const [state, action, pending] = useActionState<JoinState>(() => joinWithInvite(token), { error: null });
  return (
    <form action={action}>
      <button
        disabled={pending}
        className="mt-8 h-14 w-full rounded-2xl bg-cream text-lg font-semibold text-ink shadow-[0_10px_40px_-10px_var(--c1)] transition active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Opening your room…" : `Join ${from} 🎧`}
      </button>
      {state.error && <p className="mt-4 text-sm text-rose-300">{state.error}</p>}
    </form>
  );
}
