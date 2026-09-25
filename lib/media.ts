"use client";

import { getSupabase } from "@/lib/supabase/client";

export const MEDIA_BUCKET = "duet-media";

const cache = new Map<string, { url: string; exp: number }>();

/** Short-lived private link to a photo / voice note (only room members can get one). */
export async function signedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && hit.exp > Date.now() + 60_000) return hit.url;
  const { data } = await getSupabase().storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, exp: Date.now() + 3600_000 });
  return data.signedUrl;
}

/** Shrink big phone photos before upload (max 1600px, JPEG). */
export async function downscaleImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const MAX = 1600;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (blob) return { blob, width: w, height: h };
  } catch {
    // e.g. a format the browser can't decode — upload as-is
  }
  return { blob: file, width: 0, height: 0 };
}

/** Best recording format this browser can make that the *other* phone can also play. */
export function pickAudioMime(): string {
  const prefs = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
  if (typeof MediaRecorder === "undefined") return "";
  return prefs.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

export const extFor = (mime: string) => (mime.includes("mp4") ? "m4a" : mime.includes("webm") ? "webm" : mime.includes("png") ? "png" : "jpg");
