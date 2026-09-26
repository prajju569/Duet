import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushConfigured } from "@/lib/push";
import { copy, MILESTONE_DAYS } from "@/lib/notifyCopy";
import { buzz, firstName, firstTime } from "@/lib/notifyServer";

/**
 * Called by the database (pg_net) — never by phones:
 *   { kind: "scheduled", ids } → buzz for "send later" messages that just went out
 *   { kind: "daily" }          → 7 PM IST: countdowns, "it's been quiet", milestones
 * Authenticated with a secret that lives only in the database (app_config) and is
 * read here with the service key. Everything is logged in notify_log, so repeated
 * calls never send anything twice.
 */
export async function POST(req: NextRequest) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "no-service-key" }, { status: 503 });
  const given = req.headers.get("x-duet-cron") ?? "";
  const { data: secret } = await admin.from("app_config").select("value").eq("key", "cron_secret").maybeSingle();
  if (!secret?.value || given.length < 20 || given !== secret.value) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!pushConfigured()) return NextResponse.json({ sent: 0, reason: "not-configured" });

  const body = await req.json().catch(() => ({}));
  if (body.kind === "scheduled") return NextResponse.json({ sent: await scheduled(admin, Array.isArray(body.ids) ? body.ids.slice(0, 200) : []) });
  if (body.kind === "daily") return NextResponse.json(await daily(admin));
  return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

async function names(admin: Admin, ids: string[]) {
  const { data } = await admin.from("profiles").select("id, display_name").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  return new Map((data ?? []).map((p) => [p.id as string, firstName(p.display_name)]));
}

async function scheduled(admin: Admin, ids: unknown[]) {
  const clean = ids.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/.test(x));
  if (!clean.length) return 0;
  const { data: msgs } = await admin.from("messages").select("id, room_id, user_id, body, meta, created_at, deleted_at").in("id", clean);
  let sent = 0;
  for (const m of msgs ?? []) {
    if (!(m.meta as { scheduled?: boolean } | null)?.scheduled || m.deleted_at || !m.user_id) continue;
    if (Date.now() - new Date(m.created_at).getTime() > 30 * 60_000) continue; // stale → skip
    const [{ data: room }, { data: members }] = await Promise.all([
      admin.from("rooms").select("id, code").eq("id", m.room_id).maybeSingle(),
      admin.from("room_members").select("user_id").eq("room_id", m.room_id),
    ]);
    const partner = (members ?? []).find((x) => x.user_id !== m.user_id)?.user_id as string | undefined;
    if (!room || !partner || !(await firstTime(admin, room.id, `scheduled:${m.id}`))) continue;
    const who = (await names(admin, [m.user_id])).get(m.user_id) ?? "Someone";
    sent += await buzz(admin, room, partner, copy.scheduled(who, String(m.body)), `msg-${room.id}`);
  }
  return sent;
}

const DAY = 86_400_000;
/** Today's date in India, as a UTC-midnight timestamp. */
const istToday = () => {
  const d = new Date(Date.now() + 330 * 60_000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

async function daily(admin: Admin) {
  const { data: rooms } = await admin.from("rooms").select("*");
  const today = istToday();
  const out = { rooms: 0, countdown: 0, quiet: 0, milestone: 0 };
  for (const room of rooms ?? []) {
    if (room.closed) continue;
    const { data: members } = await admin.from("room_members").select("user_id").eq("room_id", room.id);
    const ids = (members ?? []).map((m) => m.user_id as string);
    if (ids.length !== 2) continue;
    out.rooms++;
    const nm = await names(admin, ids);
    const other = (u: string) => nm.get(ids.find((x) => x !== u)!) ?? "your person";
    const both = async (make: (u: string) => ReturnType<typeof copy.quiet>, tag: string) => {
      let n = 0;
      for (const u of ids) n += await buzz(admin, room, u, make(u), `${tag}-${room.id}`);
      return n;
    };

    // 📅 Countdown: 7, 3, 1 days before — and on the day.
    const cd = room.countdown as { label?: string; date?: string } | null;
    if (cd?.date) {
      const left = Math.round((Date.parse(cd.date) - today) / DAY);
      if ([7, 3, 1, 0].includes(left) && (await firstTime(admin, room.id, `countdown:${cd.date}:${left}`))) {
        out.countdown += await both(() => copy.countdown(cd.label ?? "", left), "countdown");
        continue; // one buzz a day is plenty
      }
    }

    // 🎂 Milestones since the room started.
    const age = Math.round((today - Date.parse(String(room.created_at).slice(0, 10))) / DAY);
    if ((MILESTONE_DAYS.includes(age) || (age > 0 && age % 365 === 0)) && (await firstTime(admin, room.id, `milestone:${age}`))) {
      out.milestone += await both((u) => copy.milestone(other(u), age), "milestone");
      continue; // one buzz a day is plenty
    }

    // 🦗 Quiet for 2+ days (once per silence, and never after 2 weeks — no nagging).
    const { data: last } = await admin
      .from("messages")
      .select("id, created_at")
      .eq("room_id", room.id)
      .neq("kind", "system")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last) {
      const days = Math.floor((Date.now() - Date.parse(last.created_at)) / DAY);
      if (days >= 2 && days <= 14 && (await firstTime(admin, room.id, `quiet:${last.id}`))) {
        out.quiet += await both((u) => copy.quiet(other(u), days), "quiet");
      }
    }
  }
  return out;
}
