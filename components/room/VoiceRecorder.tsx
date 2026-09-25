"use client";

import { useEffect, useRef, useState } from "react";
import { pickAudioMime } from "@/lib/media";
import { formatTime } from "@/lib/format";

const MAX_SECONDS = 120;

/** Recording bar: live timer, cancel, send. Auto-sends at 2 minutes. */
export function VoiceRecorder({ onDone, onCancel, onError }: { onDone: (blob: Blob, seconds: number, mime: string) => void; onCancel: () => void; onError: (msg: string) => void }) {
  const [secs, setSecs] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const sendOnStop = useRef(false);
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        const mime = pickAudioMime();
        const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
        r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        r.onstop = () => {
          s.getTracks().forEach((t) => t.stop());
          const seconds = Math.max(1, Math.round((Date.now() - started.current) / 1000));
          const type = r.mimeType || mime || "audio/webm";
          if (sendOnStop.current && chunks.current.length) onDone(new Blob(chunks.current, { type }), seconds, type);
        };
        r.start(250);
        rec.current = r;
        started.current = Date.now();
      } catch {
        onError("Microphone not allowed — check your browser settings");
        onCancel();
      }
    })();
    const t = setInterval(() => setSecs(started.current ? Math.floor((Date.now() - started.current) / 1000) : 0), 250);
    return () => {
      cancelled = true;
      clearInterval(t);
      if (rec.current?.state === "recording") rec.current.stop();
      stream.current?.getTracks().forEach((tr) => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = (send: boolean) => {
    sendOnStop.current = send;
    if (rec.current?.state === "recording") rec.current.stop();
    if (!send) onCancel();
  };

  useEffect(() => {
    if (secs >= MAX_SECONDS) finish(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secs]);

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => finish(false)} aria-label="Cancel recording" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/8 text-lg ring-1 ring-white/10">
        🗑️
      </button>
      <div className="flex h-11 flex-1 items-center gap-2.5 rounded-3xl bg-white/8 px-4 ring-1 ring-rose-300/40">
        <span className="size-2.5 animate-pulse rounded-full bg-rose-400" />
        <span className="font-medium tabular-nums">{formatTime(secs)}</span>
        <span className="text-sm text-cream/50">recording…</span>
      </div>
      <button
        type="button"
        onClick={() => finish(true)}
        aria-label="Send voice note"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-cream text-ink active:scale-90"
      >
        ➤
      </button>
    </div>
  );
}
