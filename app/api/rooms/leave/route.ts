import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Delete a room from my list. If I was the last one in it, the room is gone for good —
 * and so are its photos and voice notes in storage.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const roomId = typeof body.roomId === "string" ? body.roomId : "";
  const { data, error } = await supabase.rpc("leave_room", { p_room: roomId });
  if (error) {
    const msg = error.message.includes("NOT_A_MEMBER") ? "That room isn't yours." : "Couldn't delete the room — try again.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (data === "deleted") {
    const admin = createAdminClient();
    if (admin) {
      const bucket = admin.storage.from("duet-media") /* = MEDIA_BUCKET */;
      for (let i = 0; i < 50; i++) {
        const { data: files } = await bucket.list(roomId, { limit: 100 });
        if (!files?.length) break;
        await bucket.remove(files.map((f) => `${roomId}/${f.name}`));
      }
    }
  }
  return NextResponse.json({ result: data });
}
