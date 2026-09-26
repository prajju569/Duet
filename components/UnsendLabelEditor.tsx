"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

const IDEAS = ["Oops, never mind 🙈", "You didn't see that 👀", "Deleted by management", "Adu bidi 😅", "That was a draft", "Delete maadide 🤫"];
const MAX = 60;

/** Pick what your partner sees when you unsend a message (instead of "Message deleted"). */
export function UnsendLabelEditor({ onClose, onSaved }: { onClose: () => void; onSaved: (msg: string) => void }) {
  const supabase = getSupabase();
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void supabase.rpc("my_deleted_label").then(({ data }) => {
      setValue(typeof data === "string" ? data : "");
      setLoaded(true);
    });
  }, [supabase]);

  const save = async (label: string) => {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc("set_deleted_label", { p_label: label });
    setBusy(false);
    if (error) return setErr(error.message.includes("TOO_LONG") ? `Keep it under ${MAX} characters` : "Couldn't save — try again");
    onSaved(label.trim() ? "🙊 Unsend text saved" : "Back to “Message deleted”");
    onClose();
  };

  const shown = value.trim();
  return (
    <div className="animate-rise mt-4 rounded-2xl bg-white/6 p-4 ring-1 ring-white/10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <b className="text-sm">🙊 Your unsend text</b>
          <p className="mt-0.5 text-xs text-cream/55">When you unsend a message, this is what they see instead of “Message deleted”.</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="-mt-1 -mr-1 rounded-full px-2 py-1 text-cream/50 active:bg-white/10">
          ✕
        </button>
      </div>

      {/* Preview: how it looks in their chat */}
      <div className="mt-3 flex">
        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2 text-[15px]">
          {shown ? <span className="italic opacity-80">🙊 {shown}</span> : <span className="italic opacity-60">🚫 Message deleted</span>}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(value);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={value}
          maxLength={MAX}
          disabled={!loaded}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Message deleted"
          aria-label="Unsend text"
          className="h-11 min-w-0 flex-1 rounded-xl bg-white/8 px-3 text-[16px] ring-1 ring-white/10 placeholder:text-cream/35 focus:ring-white/30 focus:outline-none"
        />
        <button disabled={busy || !loaded} className="rounded-xl bg-cream px-4 text-sm font-semibold text-ink disabled:opacity-40">
          Save
        </button>
      </form>
      <div className="mt-1 text-right text-[11px] text-cream/35">
        {value.length}/{MAX}
      </div>

      <div className="mt-1 flex flex-wrap gap-1.5">
        {IDEAS.map((idea) => (
          <button
            key={idea}
            type="button"
            onClick={() => setValue(idea)}
            className={`rounded-full px-3 py-1.5 text-xs ring-1 transition active:scale-95 ${shown === idea ? "bg-rose-300/25 ring-rose-200/60" : "bg-white/6 ring-white/10"}`}
          >
            {idea}
          </button>
        ))}
      </div>
      {loaded && shown && (
        <button type="button" onClick={() => void save("")} disabled={busy} className="mt-3 text-xs text-cream/45 underline underline-offset-2">
          Reset to “Message deleted”
        </button>
      )}
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
      <p className="mt-3 text-[11px] text-cream/35">Only changes messages you unsend from now on.</p>
    </div>
  );
}
