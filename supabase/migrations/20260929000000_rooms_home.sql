-- Duet — rooms list on home + rename rooms
-- Paste into Supabase → SQL Editor → Run (safe to run more than once).

-- Everything the home screen shows, in one call: your rooms, who's in them,
-- the last message and how many you haven't read. Newest activity first.
create or replace function public.my_rooms()
returns table (
  id uuid, code text, name text, created_at timestamptz,
  partner_id uuid, partner_name text,
  last_body text, last_kind text, last_user uuid, last_at timestamptz,
  unread int
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
       where m.room_id = r.id and m.kind = 'text'
         and m.user_id is distinct from auth.uid()
         and m.created_at > me.last_read_at)
  from public.room_members me
  join public.rooms r on r.id = me.room_id
  left join public.room_members p on p.room_id = r.id and p.user_id <> me.user_id
  left join public.profiles pr on pr.id = p.user_id
  left join lateral (
    select m.body, m.kind, m.user_id, m.created_at from public.messages m
    where m.room_id = r.id order by m.created_at desc limit 1
  ) lm on true
  where me.user_id = auth.uid()
  order by coalesce(lm.created_at, r.created_at) desc;
$$;
revoke execute on function public.my_rooms() from public, anon;
grant  execute on function public.my_rooms() to authenticated;

-- Either person in a room can rename it.
create or replace function public.rename_room(p_room uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := left(trim(coalesce(p_name, '')), 40);
begin
  if not public.is_room_member(p_room) then raise exception 'NOT_A_MEMBER'; end if;
  if v_name = '' then raise exception 'NAME_REQUIRED'; end if;
  update public.rooms set name = v_name where id = p_room;
  return v_name;
end;
$$;
revoke execute on function public.rename_room(uuid, text) from public, anon;
grant  execute on function public.rename_room(uuid, text) to authenticated;

-- Let a rename show up live on the other phone.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;
end $$;
