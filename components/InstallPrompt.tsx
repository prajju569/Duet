"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const KEY = "duet:install-dismissed";

/** Nudges people to add Duet to their home screen — it then opens full-screen like an app. */
export function InstallPrompt() {
  const [mode, setMode] = useState<"ios" | "android" | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(KEY) === "1";
    } catch {}
    if (standalone || dismissed) return;

    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
    if (isIOS) setMode("ios");

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!mode) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    setMode(null);
  };

  return (
    <div className="animate-rise mt-8 rounded-2xl bg-white/6 p-4 ring-1 ring-white/10">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" className="size-11 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Get the Duet app</p>
          {mode === "ios" ? (
            <p className="mt-1 text-sm text-cream/65">
              Tap <b>Share</b> <span aria-hidden>⎋</span> in Safari, then <b>Add to Home Screen</b>. Opens full-screen, no browser bars.
            </p>
          ) : (
            <p className="mt-1 text-sm text-cream/65">Install it on your home screen — opens full-screen like a real app.</p>
          )}
          <div className="mt-3 flex gap-2">
            {mode === "android" && deferred && (
              <button
                onClick={async () => {
                  await deferred.prompt();
                  await deferred.userChoice;
                  dismiss();
                }}
                className="rounded-full bg-cream px-4 py-1.5 text-sm font-semibold text-ink active:scale-95"
              >
                Install
              </button>
            )}
            <button onClick={dismiss} className="rounded-full px-3 py-1.5 text-sm text-cream/55">
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
