-- Duet v4 — last seen, pin / mute / archive / mark-unread rooms, unread badge,
--           polls, countdown, "now playing" on the rooms list
-- Safe to run more than once. Run after v3.

alter table public.room_members add column if not exists last_seen_at timestamptz;
alter table public.room_members add column if not exists pinned boolean not null default false;
alter table public.room_members add column if not exists muted boolean not null default false;
alter table public.room_members add column if not exists archived boolean not null default false;
alter table public.room_members add column if not exists marked_unread boolean not null default false;

-- "I'm here": called every minute while the room is on screen (feeds "last seen").
create or replace function public.touch_room(p_room uuid)
returns void language sql security definer set search_path = public
as $$
  update public.room_members set last_seen_at = now(), marked_unread = false
  where room_id = p_room and user_id = auth.uid();
$$;
revoke execute on function public.touch_room(uuid) from public, anon;
grant  execute on function public.touch_room(uuid) to authenticated;

-- My own settings for a room (only these four fields, only my row).
create or replace function public.set_room_prefs(p_room uuid, p_prefs jsonb)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.room_members set
    pinned        = coalesce((p_prefs->>'pinned')::boolean, pinned),
    muted         = coalesce((p_prefs->>'muted')::boolean, muted),
    archived      = coalesce((p_prefs->>'archived')::boolean, archived),
    marked_unread = coalesce((p_prefs->>'marked_unread')::boolean, marked_unread)
  where room_id = p_room and user_id = auth.uid();
end;
$$;
revoke execute on function public.set_room_prefs(uuid, jsonb) from public, anon;
grant  execute on function public.set_room_prefs(uuid, jsonb) to authenticated;

-- Unread messages across all my (un-muted) rooms — for the app-icon badge.
create or replace function public.unread_total(p_user uuid)
returns int language sql stable security definer set search_path = public
as $$
  select count(*)::int
  from public.room_members me
  join public.messages m on m.room_id = me.room_id
  where me.user_id = p_user and not me.muted and not me.archived
    and m.kind <> 'system' and m.deleted_at is null
    and m.user_id is distinct from p_user
    and m.created_at > me.last_read_at;
$$;
revoke execute on function public.unread_total(uuid) from public, anon, authenticated;

create or replace function public.my_unread_total()
returns int language sql stable security definer set search_path = public
as $$ select public.unread_total(auth.uid()); $$;
revoke execute on function public.my_unread_total() from public, anon;
grant  execute on function public.my_unread_total() to authenticated;


-- Polls: a message kind + one vote per person per poll (changeable).
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'system', 'sticker', 'image', 'voice', 'moment', 'dedication', 'poll'));

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert to authenticated
  with check (
    public.is_room_member(room_id)
    and user_id = auth.uid()
    and kind in ('text', 'sticker', 'image', 'voice', 'moment', 'dedication', 'poll')
    and edited_at is null and deleted_at is null
    and (
      reply_to is null
      or exists (select 1 from public.messages m where m.id = messages.reply_to and m.room_id = messages.room_id)
    )
  );

create table if not exists public.poll_votes (
  message_id uuid not null references public.messages (id) on delete cascade,
  room_id    uuid not null references public.rooms (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  choice     smallint not null check (choice between 0 and 11),
  voted_at   timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.poll_votes enable row level security;
drop policy if exists "poll_votes_select" on public.poll_votes;
create policy "poll_votes_select" on public.poll_votes for select to authenticated using (public.is_room_member(room_id));
drop policy if exists "poll_votes_write" on public.poll_votes;
create policy "poll_votes_write" on public.poll_votes for all to authenticated
  using (user_id = auth.uid() and public.is_room_member(room_id))
  with check (
    user_id = auth.uid() and public.is_room_member(room_id)
    and exists (select 1 from public.messages m where m.id = message_id and m.room_id = poll_votes.room_id and m.kind = 'poll')
  );
grant select, insert, update, delete on public.poll_votes to authenticated;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'poll_votes') then
    alter publication supabase_realtime add table public.poll_votes;
  end if;
end $$;
alter table public.poll_votes replica identity full; -- so "vote removed" reaches the other phone

-- Countdown ("12 days until Goa 🏖️"), shared by both people in the room.
alter table public.rooms add column if not exists countdown jsonb;
create or replace function public.set_countdown(p_room uuid, p_countdown jsonb)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_room_member(p_room) then raise exception 'NOT_A_MEMBER'; end if;
  update public.rooms set countdown = case
    when p_countdown is null or p_countdown = 'null'::jsonb then null
    else jsonb_build_object('label', left(coalesce(p_countdown->>'label', ''), 40), 'date', (p_countdown->>'date')::date)
  end
  where id = p_room;
end;
$$;
revoke execute on function public.set_countdown(uuid, jsonb) from public, anon;
grant  execute on function public.set_countdown(uuid, jsonb) to authenticated;

-- Pin one message to the top of the chat (both see it).
alter table public.rooms add column if not exists pinned_message uuid references public.messages (id) on delete set null;
create or replace function public.pin_message(p_room uuid, p_message uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_room_member(p_room) then raise exception 'NOT_A_MEMBER'; end if;
  if p_message is not null and not exists (select 1 from public.messages where id = p_message and room_id = p_room and deleted_at is null) then
    raise exception 'NOT_FOUND';
  end if;
  update public.rooms set pinned_message = p_message where id = p_room;
end;
$$;
revoke execute on function public.pin_message(uuid, uuid) from public, anon;
grant  execute on function public.pin_message(uuid, uuid) to authenticated;

-- Scheduled messages ("send at 12:00 am"): private to the sender until delivered.
create table if not exists public.scheduled_messages (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  body       text not null check (char_length(body) between 1 and 4000),
  send_at    timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists scheduled_messages_due_idx on public.scheduled_messages (send_at);
alter table public.scheduled_messages enable row level security;
drop policy if exists "scheduled_own" on public.scheduled_messages;
create policy "scheduled_own" on public.scheduled_messages for all to authenticated
  using (user_id = auth.uid() and public.is_room_member(room_id))
  with check (user_id = auth.uid() and public.is_room_member(room_id) and send_at > now() and send_at < now() + interval '1 year');
grant select, insert, delete on public.scheduled_messages to authenticated;

-- Deliver everything that's due (stamped with its planned time). Run every minute by
-- pg_cron below, and also by any open Duet as a backup.
create or replace function public.deliver_due_messages()
returns int language plpgsql security definer set search_path = public
as $$
declare n int;
begin
  with due as (
    delete from public.scheduled_messages where send_at <= now() returning *
  )
  insert into public.messages (room_id, user_id, kind, body, created_at, meta)
  select d.room_id, d.user_id, 'text', d.body, d.send_at, jsonb_build_object('scheduled', true)
  from due d
  where exists (select 1 from public.room_members m where m.room_id = d.room_id and m.user_id = d.user_id);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.deliver_due_messages() from public, anon;
grant  execute on function public.deliver_due_messages() to authenticated;

do $$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    begin
      create extension if not exists pg_cron;
    exception when others then null;
    end;
  end;
  perform cron.schedule('duet-scheduled-messages', '* * * * *', 'select public.deliver_due_messages()');
exception when others then
  raise notice 'pg_cron unavailable: scheduled messages are delivered whenever Duet is open';
end $$;

-- Rooms list: + pinned / muted / archived / marked unread + partner's last seen.
drop function if exists public.my_rooms();
create function public.my_rooms()
returns table (
  id uuid, code text, name text, created_at timestamptz,
  partner_id uuid, partner_name text,
  last_body text, last_kind text, last_user uuid, last_at timestamptz,
  unread int,
  last_meta jsonb, last_deleted boolean,
  dedication jsonb,
  pinned boolean, muted boolean, archived boolean, marked_unread boolean,
  partner_last_seen timestamptz,
  now_playing jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id, r.code, r.name, r.created_at,
    p.user_id, pr.display_name,
    lm.body, lm.kind, lm.user_id, coalesce(lm.created_at, r.created_at),
    (select count(*)::int from public.messages m
       where m.room_id = r.id and m.kind <> 'system'
         and m.deleted_at is null
         and m.user_id is distinct from auth.uid()
         and m.created_at > me.last_read_at),
    lm.meta, lm.deleted_at is not null,
    (select jsonb_build_object('by', d.user_id, 'at', d.created_at, 'title', d.meta->>'title',
                               'videoId', d.meta->>'videoId', 'note', d.meta->>'note')
       from public.messages d
      where d.room_id = r.id and d.kind = 'dedication' and d.deleted_at is null
        and d.created_at > now() - interval '7 days'
      order by d.created_at desc limit 1),
    me.pinned, me.muted, me.archived, me.marked_unread,
    p.last_seen_at,
    -- The song is "now playing" only if it's actually still mid-song right now.
    (select jsonb_build_object('title', ps.title, 'videoId', ps.video_id)
       from public.playback_state ps
      where ps.room_id = r.id and ps.is_playing and ps.video_id is not null
        and ps.position_sec + extract(epoch from now() - ps.updated_at) < coalesce(ps.duration_sec, 600))
  from public.room_members me
  join public.rooms r on r.id = me.room_id
  left join public.room_members p on p.room_id = r.id and p.user_id <> me.user_id
  left join public.profiles pr on pr.id = p.user_id
  left join lateral (
    select m.body, m.kind, m.user_id, m.created_at, m.meta, m.deleted_at from public.messages m
    where m.room_id = r.id order by m.created_at desc limit 1
  ) lm on true
  where me.user_id = auth.uid()
  order by me.pinned desc, coalesce(lm.created_at, r.created_at) desc;
$$;
revoke execute on function public.my_rooms() from public, anon;
grant  execute on function public.my_rooms() to authenticated;

create or replace function public.duet_schema_version()
returns int language sql immutable as $$ select 4 $$;
grant execute on function public.duet_schema_version() to anon, authenticated;
