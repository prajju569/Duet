-- Duet v5 — delete / leave a room. Safe to run more than once.
--  • Only you in the room  → it's deleted completely.
--  • Your partner is there → you leave; the room is closed (nobody new can join and see
--    the old chat); they keep it until they delete it too — then it's gone for good.

alter table public.rooms add column if not exists closed boolean not null default false;

-- Joining (by code or invite) is blocked for closed rooms, on top of the 2-person limit.
create or replace function public.enforce_room_limit()
returns trigger
language plpgsql
as $$
begin
  perform 1 from public.rooms where id = new.room_id for update; -- serialize joins
  if exists (select 1 from public.rooms where id = new.room_id and closed) then
    raise exception 'ROOM_CLOSED' using errcode = 'P0001';
  end if;
  if (select count(*) from public.room_members where room_id = new.room_id) >= 2 then
    raise exception 'ROOM_FULL' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.leave_room(p_room uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.is_room_member(p_room) then raise exception 'NOT_A_MEMBER'; end if;
  select split_part(coalesce(display_name, 'Someone'), ' ', 1) into v_name from public.profiles where id = auth.uid();

  delete from public.room_members where room_id = p_room and user_id = auth.uid();

  if not exists (select 1 from public.room_members where room_id = p_room) then
    delete from public.rooms where id = p_room; -- messages, songs, polls… all go with it
    return 'deleted';
  end if;

  update public.rooms set closed = true where id = p_room;
  delete from public.room_invites where room_id = p_room;
  insert into public.messages (room_id, user_id, kind, body)
  values (p_room, null, 'system', '👋 ' || coalesce(v_name, 'Someone') || ' left the room');
  return 'left';
end;
$$;
revoke execute on function public.leave_room(uuid) from public, anon;
grant  execute on function public.leave_room(uuid) to authenticated;

create or replace function public.duet_schema_version()
returns int language sql immutable as $$ select 5 $$;
grant execute on function public.duet_schema_version() to anon, authenticated;
