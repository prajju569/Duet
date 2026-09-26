-- Duet v3 — private Duet IDs + richer room list
-- Safe to run more than once.

-- 1. Your Duet ID (username) is half of your login: nobody else may read it.
--    Your partner can still read your name; only you can read your own ID (via my_profile()).
revoke select on public.profiles from anon, authenticated;
grant select (id, display_name, created_at) on public.profiles to authenticated;
grant update (display_name, username) on public.profiles to authenticated;

create or replace function public.my_profile()
returns table (display_name text, username text)
language sql stable security definer set search_path = public
as $$
  select p.display_name, p.username from public.profiles p where p.id = auth.uid();
$$;
revoke execute on function public.my_profile() from public, anon;
grant  execute on function public.my_profile() to authenticated;

-- 2. Rooms list: unread counts every kind of message (photos, voice, stickers…),
--    shows what the last message was, and surfaces the latest song dedication.
drop function if exists public.my_rooms();
create function public.my_rooms()
returns table (
  id uuid, code text, name text, created_at timestamptz,
  partner_id uuid, partner_name text,
  last_body text, last_kind text, last_user uuid, last_at timestamptz,
  unread int,
  last_meta jsonb, last_deleted boolean,
  dedication jsonb
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
      order by d.created_at desc limit 1)
  from public.room_members me
  join public.rooms r on r.id = me.room_id
  left join public.room_members p on p.room_id = r.id and p.user_id <> me.user_id
  left join public.profiles pr on pr.id = p.user_id
  left join lateral (
    select m.body, m.kind, m.user_id, m.created_at, m.meta, m.deleted_at from public.messages m
    where m.room_id = r.id order by m.created_at desc limit 1
  ) lm on true
  where me.user_id = auth.uid()
  order by coalesce(lm.created_at, r.created_at) desc;
$$;
revoke execute on function public.my_rooms() from public, anon;
grant  execute on function public.my_rooms() to authenticated;

create or replace function public.duet_schema_version()
returns int language sql immutable as $$ select 3 $$;
grant execute on function public.duet_schema_version() to anon, authenticated;
