-- =====================================================================
-- Duet — initial schema
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to run once on a fresh project.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text check (display_name is null or char_length(display_name) between 1 and 40),
  created_at    timestamptz not null default now()
);

create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null default 'Our room',
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.room_members (
  room_id       uuid not null references public.rooms (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  joined_at     timestamptz not null default now(),
  last_read_at  timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index room_members_user_idx on public.room_members (user_id);

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  kind        text not null default 'text' check (kind in ('text', 'system')),
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index messages_room_created_idx on public.messages (room_id, created_at desc);

-- One reaction per person per message. Removing a reaction sets emoji to null
-- (an UPDATE) so realtime never needs unfilterable DELETE events.
create table public.message_reactions (
  message_id  uuid not null references public.messages (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  room_id     uuid not null references public.rooms (id) on delete cascade,
  emoji       text check (emoji is null or char_length(emoji) <= 16),
  updated_at  timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index message_reactions_room_idx on public.message_reactions (room_id);

create table public.queue_items (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms (id) on delete cascade,
  video_id    text not null check (char_length(video_id) between 5 and 32),
  title       text not null,
  channel     text,
  thumbnail   text,
  duration_sec integer,
  added_by    uuid references auth.users (id) on delete set null,
  status      text not null default 'queued' check (status in ('queued', 'played', 'removed')),
  created_at  timestamptz not null default now()
);
create index queue_items_room_idx on public.queue_items (room_id, status, created_at);

create table public.favourites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  video_id    text not null,
  title       text not null,
  channel     text,
  thumbnail   text,
  duration_sec integer,
  created_at  timestamptz not null default now(),
  unique (user_id, video_id)
);

-- The single shared playback state for a room. updated_at is always set by the
-- server (clock_timestamp()) so both clients agree on "when".
create table public.playback_state (
  room_id       uuid primary key references public.rooms (id) on delete cascade,
  video_id      text,
  title         text,
  channel       text,
  thumbnail     text,
  duration_sec  integer,
  added_by      uuid references auth.users (id) on delete set null,
  is_playing    boolean not null default false,
  position_sec  double precision not null default 0 check (position_sec >= 0),
  updated_at    timestamptz not null default clock_timestamp(),
  updated_by    uuid references auth.users (id) on delete set null
);

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- SECURITY DEFINER so RLS policies can call it without recursing into
-- room_members' own policies.
create or replace function public.is_room_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room and user_id = auth.uid()
  );
$$;

-- Server clock in epoch milliseconds — used by clients to estimate clock offset.
create or replace function public.server_time()
returns double precision
language sql
volatile
as $$
  select extract(epoch from clock_timestamp()) * 1000;
$$;

-- Auto-create a profile for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Hard limit: a room holds at most 2 people.
create or replace function public.enforce_room_limit()
returns trigger
language plpgsql
as $$
begin
  perform 1 from public.rooms where id = new.room_id for update; -- serialize joins
  if (select count(*) from public.room_members where room_id = new.room_id) >= 2 then
    raise exception 'ROOM_FULL' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger room_members_limit
  before insert on public.room_members
  for each row execute function public.enforce_room_limit();

-- ---------------------------------------------------------------------
-- RPCs (all actions that need server-side rules)
-- ---------------------------------------------------------------------

create or replace function public.create_room(p_name text default 'Our room')
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
  v_code text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.rooms where code = v_code);
  end loop;

  insert into public.rooms (code, name, created_by)
  values (v_code, coalesce(nullif(trim(p_name), ''), 'Our room'), auth.uid())
  returning * into v_room;

  insert into public.room_members (room_id, user_id) values (v_room.id, auth.uid());
  insert into public.playback_state (room_id) values (v_room.id);

  return v_room;
end;
$$;

-- Join by code. Idempotent for existing members; raises ROOM_FULL / ROOM_NOT_FOUND.
create or replace function public.join_room(p_code text)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_room from public.rooms where code = upper(trim(p_code));
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if not exists (select 1 from public.room_members where room_id = v_room.id and user_id = auth.uid()) then
    insert into public.room_members (room_id, user_id) values (v_room.id, auth.uid());
  end if;

  return v_room;
end;
$$;

-- Write the shared playback state ("last action wins"). If the song changed,
-- drop a system message into chat.
create or replace function public.set_playback(
  p_room          uuid,
  p_video_id      text,
  p_title         text,
  p_channel       text,
  p_thumbnail     text,
  p_duration_sec  integer,
  p_added_by      uuid,
  p_is_playing    boolean,
  p_position_sec  double precision
)
returns public.playback_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old   public.playback_state;
  v_new   public.playback_state;
  v_name  text;
begin
  if not public.is_room_member(p_room) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select * into v_old from public.playback_state where room_id = p_room for update;

  insert into public.playback_state as ps (
    room_id, video_id, title, channel, thumbnail, duration_sec, added_by,
    is_playing, position_sec, updated_at, updated_by
  ) values (
    p_room, p_video_id, p_title, p_channel, p_thumbnail, p_duration_sec, p_added_by,
    coalesce(p_is_playing, false), greatest(coalesce(p_position_sec, 0), 0), clock_timestamp(), auth.uid()
  )
  on conflict (room_id) do update set
    video_id     = excluded.video_id,
    title        = excluded.title,
    channel      = excluded.channel,
    thumbnail    = excluded.thumbnail,
    duration_sec = excluded.duration_sec,
    added_by     = excluded.added_by,
    is_playing   = excluded.is_playing,
    position_sec = excluded.position_sec,
    updated_at   = excluded.updated_at,
    updated_by   = excluded.updated_by
  returning * into v_new;

  if p_video_id is not null and (v_old.video_id is distinct from p_video_id) then
    select coalesce(display_name, 'Someone') into v_name from public.profiles where id = auth.uid();
    insert into public.messages (room_id, user_id, kind, body)
    values (p_room, auth.uid(), 'system', '🎵 ' || coalesce(v_name, 'Someone') || ' played ' || coalesce(p_title, 'a song'));
  end if;

  return v_new;
end;
$$;

-- Play a specific queue item now.
create or replace function public.play_queue_item(p_item uuid)
returns public.playback_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.queue_items;
begin
  select * into v_item from public.queue_items where id = p_item;
  if not found or not public.is_room_member(v_item.room_id) then
    raise exception 'NOT_FOUND';
  end if;

  update public.queue_items set status = 'played' where id = p_item;

  return public.set_playback(
    v_item.room_id, v_item.video_id, v_item.title, v_item.channel, v_item.thumbnail,
    v_item.duration_sec, v_item.added_by, true, 0
  );
end;
$$;

-- Skip / auto-advance. Idempotent: only advances if the room is still on
-- p_from_video, so when both phones hit "song ended" at once we advance once.
create or replace function public.advance_queue(p_room uuid, p_from_video text)
returns public.playback_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.playback_state;
  v_next  public.queue_items;
begin
  if not public.is_room_member(p_room) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select * into v_state from public.playback_state where room_id = p_room for update;
  if v_state.video_id is distinct from p_from_video then
    return v_state; -- someone already moved on
  end if;

  select * into v_next from public.queue_items
  where room_id = p_room and status = 'queued'
  order by created_at
  limit 1;

  if not found then
    -- Nothing queued: stop at the end of the current song.
    update public.playback_state
      set is_playing = false,
          position_sec = coalesce(
            duration_sec,
            position_sec + case when is_playing then extract(epoch from clock_timestamp() - updated_at) else 0 end
          ),
          updated_at = clock_timestamp(),
          updated_by = auth.uid()
      where room_id = p_room
      returning * into v_state;
    return v_state;
  end if;

  return public.play_queue_item(v_next.id);
end;
$$;

-- Seen ticks: mark everything up to now as read for the caller.
create or replace function public.mark_read(p_room uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.room_members set last_read_at = now()
  where room_id = p_room and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Row Level Security: only the (max 2) members of a room can touch it.
-- ---------------------------------------------------------------------

alter table public.profiles          enable row level security;
alter table public.rooms             enable row level security;
alter table public.room_members      enable row level security;
alter table public.messages          enable row level security;
alter table public.message_reactions enable row level security;
alter table public.queue_items       enable row level security;
alter table public.favourites        enable row level security;
alter table public.playback_state    enable row level security;

-- profiles: see yourself + people you share a room with; edit only yourself.
create policy "profiles_select" on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.room_members me
      join public.room_members them on them.room_id = me.room_id
      where me.user_id = auth.uid() and them.user_id = profiles.id
    )
  );
create policy "profiles_update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- rooms: members read. Creation/joining goes through RPCs only.
create policy "rooms_select" on public.rooms for select to authenticated
  using (public.is_room_member(id));

-- room_members: members see the membership of their rooms.
create policy "room_members_select" on public.room_members for select to authenticated
  using (public.is_room_member(room_id));
create policy "room_members_leave" on public.room_members for delete to authenticated
  using (user_id = auth.uid());

-- messages
create policy "messages_select" on public.messages for select to authenticated
  using (public.is_room_member(room_id));
create policy "messages_insert" on public.messages for insert to authenticated
  with check (public.is_room_member(room_id) and user_id = auth.uid() and kind = 'text');

-- reactions
create policy "reactions_select" on public.message_reactions for select to authenticated
  using (public.is_room_member(room_id));
create policy "reactions_insert" on public.message_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_room_member(room_id)
    and exists (select 1 from public.messages m where m.id = message_id and m.room_id = message_reactions.room_id)
  );
create policy "reactions_update" on public.message_reactions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_room_member(room_id));

-- queue
create policy "queue_select" on public.queue_items for select to authenticated
  using (public.is_room_member(room_id));
create policy "queue_insert" on public.queue_items for insert to authenticated
  with check (public.is_room_member(room_id) and added_by = auth.uid() and status = 'queued');
create policy "queue_update" on public.queue_items for update to authenticated
  using (public.is_room_member(room_id))
  with check (public.is_room_member(room_id));

-- favourites: strictly personal
create policy "favourites_all" on public.favourites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- playback_state: read by members; writes only via set_playback / advance_queue.
create policy "playback_select" on public.playback_state for select to authenticated
  using (public.is_room_member(room_id));

-- Lock down direct function access to signed-in users.
revoke execute on function public.create_room(text)                from public, anon;
revoke execute on function public.join_room(text)                  from public, anon;
revoke execute on function public.set_playback(uuid, text, text, text, text, integer, uuid, boolean, double precision) from public, anon;
revoke execute on function public.play_queue_item(uuid)            from public, anon;
revoke execute on function public.advance_queue(uuid, text)        from public, anon;
revoke execute on function public.mark_read(uuid)                  from public, anon;
grant  execute on function public.create_room(text)                to authenticated;
grant  execute on function public.join_room(text)                  to authenticated;
grant  execute on function public.set_playback(uuid, text, text, text, text, integer, uuid, boolean, double precision) to authenticated;
grant  execute on function public.play_queue_item(uuid)            to authenticated;
grant  execute on function public.advance_queue(uuid, text)        to authenticated;
grant  execute on function public.mark_read(uuid)                  to authenticated;

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------

-- Postgres Changes for chat, reactions, queue, read receipts and playback.
alter publication supabase_realtime add table
  public.messages,
  public.message_reactions,
  public.queue_items,
  public.room_members,
  public.playback_state;

-- Broadcast + Presence run on the private channel "room:<room_id>".
-- Only members of that room may join it.
create policy "room_channel_read" on realtime.messages for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.is_room_member(
      case when realtime.topic() ~ '^room:[0-9a-f-]{36}$'
           then substring(realtime.topic() from 6)::uuid end
    )
  );

create policy "room_channel_write" on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.is_room_member(
      case when realtime.topic() ~ '^room:[0-9a-f-]{36}$'
           then substring(realtime.topic() from 6)::uuid end
    )
  );
