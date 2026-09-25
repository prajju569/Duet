"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { InstallPrompt } from "@/components/InstallPrompt";
import { QuickLoginSetup } from "@/components/QuickLoginSetup";

type Room = { id: string; code: string; name: string };

const ERRORS: Record<string, string> = {
  full: "That room already has two people in it.",
  notfound: "No room with that code — double-check it?",
};

export function HomeClient({
  email,
  displayName,
  username,
  rooms,
  next,
  error,
}: {
  email: string;
  displayName: string | null;
  username: string | null;
  rooms: Room[];
  next: string | null;
  error: string | null;
}) {
  const supabase = getSupabase();
  const router = useRouter();
  const [name, setName] = useState(displayName ?? "");
  const [editingName, setEditingName] = useState(!displayName);
  const [myUsername, setMyUsername] = useState(username);
  const [pinOpen, setPinOpen] = useState(!username);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(error ? (ERRORS[error] ?? error) : null);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").update({ display_name: n }).eq("id", user!.id);
    setBusy(false);
    if (error) return setMsg(error.message);
    setEditingName(false);
    // First time: set up username + PIN before heading on (it's skippable).
    if (next && myUsername) router.push(next);
    else router.refresh();
  }

  async function createRoom() {
    setBusy(true);
    const { data, error } = await supabase.rpc("create_room", { p_name: "Our room" });
    setBusy(false);
    if (error || !data) return setMsg(error?.message ?? "Couldn't create a room");
    router.push(`/room/${(data as Room).code}?invite=1`);
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (c.length < 4) return;
    router.push(`/room/${c}`);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="duet-bg relative min-h-dvh overflow-hidden px-6 pt-[max(env(safe-area-inset-top),40px)] pb-10">
      <div className="animate-rise relative z-10 mx-auto max-w-md">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-5xl italic">Duet</h1>
          <button onClick={signOut} className="text-xs text-cream/45 hover:text-cream">
            Sign out
          </button>
        </div>

        {editingName ? (
          <form onSubmit={saveName} className="mt-10">
            <label className="text-sm text-cream/70">What should we call you?</label>
            <p className="text-xs text-cream/45">Shows up on your picks — “{name.trim() || "Your name"}'s pick”.</p>
            <div className="mt-3 flex gap-2">
              <input
                autoFocus
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your first name"
                className="h-12 min-w-0 flex-1 rounded-2xl bg-white/8 px-4 ring-1 ring-white/10 placeholder:text-cream/35 focus:ring-white/30 focus:outline-none"
              />
              <button disabled={busy || !name.trim()} className="rounded-2xl bg-cream px-5 font-semibold text-ink disabled:opacity-40">
                Save
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="mt-3 text-cream/65">
              Hey {displayName}.{" "}
              <button onClick={() => setEditingName(true)} className="text-cream/40 underline underline-offset-2">
                change name
              </button>
              {myUsername && !pinOpen && (
                <>
                  {" · "}
                  <button onClick={() => setPinOpen(true)} className="text-cream/40 underline underline-offset-2">
                    change PIN
                  </button>
                </>
              )}
            </p>
            {myUsername && !pinOpen && <p className="mt-1 text-xs text-cream/35">Log in anywhere as <b>{myUsername}</b> + your PIN</p>}

            {pinOpen && (
              <QuickLoginSetup
                suggested={(displayName ?? "").toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 20)}
                existingUsername={myUsername}
                onDone={(u) => {
                  setMyUsername(u);
                  setPinOpen(false);
                  setMsg(null);
                  if (next) router.push(next);
                }}
                onSkip={() => {
                  setPinOpen(false);
                  if (next) router.push(next);
                }}
              />
            )}

            {rooms.length > 0 && (
              <div className="mt-10">
                <h2 className="text-xs tracking-[0.2em] text-cream/45 uppercase">Your rooms</h2>
                <ul className="mt-3 space-y-2">
                  {rooms.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/room/${r.code}`}
                        className="flex items-center justify-between rounded-2xl bg-white/6 px-4 py-4 ring-1 ring-white/10 transition hover:bg-white/10 active:scale-[0.99]"
                      >
                        <span className="font-display text-lg italic">{r.name}</span>
                        <span className="font-mono text-sm tracking-widest text-cream/50">{r.code}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-10 space-y-3">
              <button
                onClick={createRoom}
                disabled={busy}
                className="h-13 w-full rounded-2xl bg-cream font-semibold text-ink transition active:scale-[0.98] disabled:opacity-50"
              >
                Create a new room
              </button>
              <form onSubmit={join} className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Room code"
                  autoCapitalize="characters"
                  className="h-13 min-w-0 flex-1 rounded-2xl bg-white/8 px-4 font-mono tracking-widest ring-1 ring-white/10 placeholder:font-sans placeholder:tracking-normal placeholder:text-cream/35 focus:ring-white/30 focus:outline-none"
                />
                <button className="rounded-2xl bg-white/10 px-5 font-semibold ring-1 ring-white/15">Join</button>
              </form>
            </div>
          </>
        )}

        {msg && <p className="mt-5 text-sm text-rose-300">{msg}</p>}
        {!editingName && <InstallPrompt />}
        <p className="mt-12 text-center text-xs text-cream/30">Signed in as {email}</p>
      </div>
    </div>
  );
}
