import { NextResponse } from "next/server";
import { pushConfigured } from "@/lib/push";

/** The public half of the push key, read at request time (so a missed rebuild can't hide it). */
export function GET() {
  return NextResponse.json({ key: pushConfigured() ? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY : null });
}
