import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** The deploy that's live right now. */
export function GET() {
  return NextResponse.json({ build: process.env.VERCEL_GIT_COMMIT_SHA || "dev" }, { headers: { "Cache-Control": "no-store" } });
}
