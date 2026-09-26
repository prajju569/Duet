"use client";

import { useEffect, useRef, useState } from "react";
import { pickAudioMime } from "@/lib/media";
import { formatTime } from "@/lib/format";

const MAX_SECONDS = 120;

/** Recording bar: live timer, cancel, send. Auto-sends at 2 minutes. */
export function VoiceRecorder({
  onDone,
  onCancel,
  onError,
  onTick,
}: {
  onDone: (blob: Blob, seconds: number, mime: string, peaks: number[]) => void;
  onCancel: () => void;
  onError: (msg: string) => void;
  /** every ~3s while recording (tells the other phone "recording a voice note…") */
  onTick?: () => void;
}) {
  const [secs, setSecs] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const sendOnStop = useRef(false);
  const meter = useRef<(() => void) | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const levels = useRef<number[]>([]); // loudness samples for the waveform
  const [live, setLive] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        // Loudness meter → waveform bars (drawn live, and saved with the note).
        try {
          const ctx = new AudioContext();
          const src = ctx.createMediaStreamSource(s);
          const an = ctx.createAnalyser();
          an.fftSize = 512;
          src.connect(an);
          const buf = new Uint8Array(an.fftSize);
          const sample = setInterval(() => {
            an.getByteTimeDomainData(buf);
            let sum = 0;
            for (const v of buf) sum += ((v - 128) / 128) ** 2;
            levels.current.push(Math.sqrt(sum / buf.length));
            setLive(levels.current.slice(-28));
          }, 100);
          meter.current = () => {
            clearInterval(sample);
            void ctx.close();
          };
        } catch {}
        const mime = pickAudioMime();
        const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
        r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        r.onstop = () => {
          s.getTracks().forEach((t) => t.stop());
          meter.current?.();
          const seconds = Math.max(1, Math.round((Date.now() - started.current) / 1000));
          const type = r.mimeType || mime || "audio/webm";
          if (sendOnStop.current && chunks.current.length) onDone(new Blob(chunks.current, { type }), seconds, type, toPeaks(levels.current));
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
      meter.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = (send: boolean) => {
    sendOnStop.current = send;
    if (rec.current?.state === "recording") rec.current.stop();
    if (!send) onCancel();
  };

  useEffect(() => {
    if (secs % 3 === 0) onTick?.();
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
        <span className="flex h-6 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden" aria-hidden>
          {live.map((v, i) => (
            <span key={i} className="w-[3px] shrink-0 rounded-full bg-rose-300/80" style={{ height: `${Math.max(12, Math.min(100, v * 400))}%` }} />
          ))}
        </span>
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

/** Squash the loudness samples into 40 bars, scaled 8–100. */
export function toPeaks(samples: number[], bars = 40): number[] {
  if (!samples.length) return [];
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const a = Math.floor((i * samples.length) / bars);
    const b = Math.max(a + 1, Math.floor(((i + 1) * samples.length) / bars));
    out.push(Math.max(...samples.slice(a, b)));
  }
  const top = Math.max(...out) || 1;
  return out.map((v) => Math.round(8 + (v / top) * 92));
}
