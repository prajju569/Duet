-- =====================================================================
-- Duet v2 — chat extras, music extras, "us" features
-- Paste ALL of this into Supabase → SQL Editor → Run. Safe to run more than once.
--
-- Until this has been run, the app keeps working and simply hides the new
-- features (it checks duet_schema_version()).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Messages: new kinds, metadata, edit / unsend
-- ---------------------------------------------------------------------
alter table public.messages add column if not exists meta jsonb;
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'system', 'sticker', 'image', 'voice', 'moment', 'dedication'));

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert to authenticated
  with check (
    public.is_room_member(room_id)
    and user_id = auth.uid()
    and kind in ('text', 'sticker', 'image', 'voice', 'moment', 'dedication')
    and edited_at is null and deleted_at is null
    and (
      reply_to is null
      or exists (select 1 from public.messages m where m.id = messages.reply_to and m.room_id = messages.room_id)
    )
  );

-- Edit your own text message (within 24 hours).
create or replace function public.edit_message(p_id uuid, p_body text)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg public.messages;
  v_body text := trim(coalesce(p_body, ''));
begin
  select * into v_msg from public.messages where id = p_id for update;
  if not found or v_msg.user_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if v_msg.kind <> 'text' or v_msg.deleted_at is not null then raise exception 'NOT_EDITABLE'; end if;
  if v_msg.created_at < now() - interval '24 hours' then raise exception 'TOO_OLD'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 4000 then raise exception 'BAD_BODY'; end if;
  update public.messages set body = v_body, edited_at = now() where id = p_id returning * into v_msg;
  return v_msg;
end;
$$;

-- Unsend: the content is wiped for both of you, a "deleted" placeholder stays.
create or replace function public.delete_message(p_id uuid)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg public.messages;
begin
  select * into v_msg from public.messages where id = p_id for update;
  if not found or v_msg.user_id is distinct from auth.uid() or v_msg.kind = 'system' then raise exception 'NOT_ALLOWED'; end if;
  update public.messages
    set body = 'Message deleted', meta = null, deleted_at = now()
    where id = p_id returning * into v_msg;
  return v_msg;
end;
$$;

-- ---------------------------------------------------------------------
-- Queue: drag to reorder
-- ---------------------------------------------------------------------
alter table public.queue_items add column if not exists position double precision;
update public.queue_items set position = extract(epoch from created_at) where position is null;
alter table public.queue_items alter column position set default extract(epoch from clock_timestamp());

create or replace function public.reorder_queue(p_room uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i int;
begin
  if not public.is_room_member(p_room) then raise exception 'NOT_A_MEMBER'; end if;
  for i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
    update public.queue_items set position = i where id = p_ids[i] and room_id = p_room;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- "Our Songs" — a shared playlist for the room
-- ---------------------------------------------------------------------
create table if not exists public.room_songs (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms (id) on delete cascade,
  video_id      text not null,
  title         text not null,
  channel       text,
  thumbnail     text,
  duration_sec  integer,
  added_by      uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (room_id, video_id)
);
alter table public.room_songs enable row level security;
drop policy if exists "room_songs_select" on public.room_songs;
drop policy if exists "room_songs_insert" on public.room_songs;
drop policy if exists "room_songs_delete" on public.room_songs;
create policy "room_songs_select" on public.room_songs for select to authenticated using (public.is_room_member(room_id));
create policy "room_songs_insert" on public.room_songs for insert to authenticated
  with check (public.is_room_member(room_id) and added_by = auth.uid());
create policy "room_songs_delete" on public.room_songs for delete to authenticated using (public.is_room_member(room_id));

-- ---------------------------------------------------------------------
-- Listening history (filled automatically whenever a new song starts)
-- ---------------------------------------------------------------------
create table if not exists public.play_history (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms (id) on delete cascade,
  video_id      text not null,
  title         text,
  channel       text,
  thumbnail     text,
  duration_sec  integer,
  played_by     uuid references auth.users (id) on delete set null,
  played_at     timestamptz not null default now()
);
create index if not exists play_history_room_idx on public.play_history (room_id, played_at desc);
alter table public.play_history enable row level security;
drop policy if exists "play_history_select" on public.play_history;
create policy "play_history_select" on public.play_history for select to authenticated using (public.is_room_member(room_id));

-- Songs you've played together, most-played first.
create or replace function public.room_history(p_room uuid)
returns table (video_id text, title text, channel text, duration_sec int, plays int, first_played timestamptz, last_played timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select h.video_id, (array_agg(h.title order by h.played_at desc))[1], (array_agg(h.channel order by h.played_at desc))[1],
         max(h.duration_sec), count(*)::int, min(h.played_at), max(h.played_at)
  from public.play_history h
  where h.room_id = p_room and public.is_room_member(p_room)
  group by h.video_id
  order by count(*) desc, max(h.played_at) desc
  limit 200;
$$;

-- ---------------------------------------------------------------------
-- Room settings: autoplay, together-time counter, theme, scheduled song
-- ---------------------------------------------------------------------
alter table public.rooms add column if not exists autoplay boolean not null default true;
alter table public.rooms add column if not exists listened_seconds bigint not null default 0;
alter table public.rooms add column if not exists theme text;
alter table public.rooms add column if not exists scheduled jsonb;

create or replace function public.add_listen_time(p_room uuid, p_seconds int)
returns bigint
language sql
security definer
set search_path = public
as $$
  update public.rooms set listened_seconds = listened_seconds + greatest(0, least(p_seconds, 120))
  where id = p_room and public.is_room_member(p_room)
  returning listened_seconds;
$$;

create or replace function public.update_room_settings(p_room uuid, p_settings jsonb)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
begin
  if not public.is_room_member(p_room) then raise exception 'NOT_A_MEMBER'; end if;
  update public.rooms set
    autoplay  = case when p_settings ? 'autoplay'  then coalesce((p_settings->>'autoplay')::boolean, autoplay) else autoplay end,
    theme     = case when p_settings ? 'theme'     then left(p_settings->>'theme', 40) else theme end,
    scheduled = case when p_settings ? 'scheduled' then nullif(p_settings->'scheduled', 'null'::jsonb) else scheduled end
  where id = p_room
  returning * into v_room;
  return v_room;
end;
$$;

-- ---------------------------------------------------------------------
-- Playback: shared core so songs get logged + autoplay can say who/what
-- ---------------------------------------------------------------------
create or replace function public._apply_playback(
  p_room uuid, p_video_id text, p_title text, p_channel text, p_thumbnail text,
  p_duration_sec integer, p_added_by uuid, p_is_playing boolean, p_position_sec double precision,
  p_note text
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
  select * into v_old from public.playback_state where room_id = p_room for update;

  insert into public.playback_state as ps (
    room_id, video_id, title, channel, thumbnail, duration_sec, added_by,
    is_playing, position_sec, updated_at, updated_by
  ) values (
    p_room, p_video_id, p_title, p_channel, p_thumbnail, p_duration_sec, p_added_by,
    coalesce(p_is_playing, false), greatest(coalesce(p_position_sec, 0), 0), clock_timestamp(), auth.uid()
  )
  on conflict (room_id) do update set
    video_id = excluded.video_id, title = excluded.title, channel = excluded.channel,
    thumbnail = excluded.thumbnail, duration_sec = excluded.duration_sec, added_by = excluded.added_by,
    is_playing = excluded.is_playing, position_sec = excluded.position_sec,
    updated_at = excluded.updated_at, updated_by = excluded.updated_by
  returning * into v_new;

  if p_video_id is not null and (v_old.video_id is distinct from p_video_id) then
    select coalesce(display_name, 'Someone') into v_name from public.profiles where id = auth.uid();
    insert into public.messages (room_id, user_id, kind, body)
    values (p_room, auth.uid(), 'system',
      coalesce(p_note, '🎵 ' || coalesce(v_name, 'Someone') || ' played ' || coalesce(p_title, 'a song')));
    insert into public.play_history (room_id, video_id, title, channel, thumbnail, duration_sec, played_by)
    values (p_room, p_video_id, p_title, p_channel, p_thumbnail, p_duration_sec, coalesce(p_added_by, auth.uid()));
  end if;

  return v_new;
end;
$$;
revoke execute on function public._apply_playback(uuid, text, text, text, text, integer, uuid, boolean, double precision, text) from public, anon, authenticated;

create or replace function public.set_playback(
  p_room uuid, p_video_id text, p_title text, p_channel text, p_thumbnail text,
  p_duration_sec integer, p_added_by uuid, p_is_playing boolean, p_position_sec double precision
)
returns public.playback_state
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_room_member(p_room) then raise exception 'NOT_A_MEMBER'; end if;
  return public._apply_playback(p_room, p_video_id, p_title, p_channel, p_thumbnail, p_duration_sec,
    p_added_by, p_is_playing, p_position_sec, null);
end;
$$;

-- Queue ran out? With autoplay on, pick something you've both enjoyed before.
create or replace function public.advance_queue(p_room uuid, p_from_video text)
returns public.playback_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.playback_state;
  v_next  public.queue_items;
  v_room  public.rooms;
  v_pick  record;
begin
  if not public.is_room_member(p_room) then raise exception 'NOT_A_MEMBER'; end if;

  select * into v_state from public.playback_state where room_id = p_room for update;
  if v_state.video_id is distinct from p_from_video then
    return v_state; -- someone already moved on
  end if;

  select * into v_next from public.queue_items
  where room_id = p_room and status = 'queued'
  order by coalesce(position, extract(epoch from created_at)), created_at
  limit 1;

  if found then
    return public.play_queue_item(v_next.id);
  end if;

  select * into v_room from public.rooms where id = p_room;
  if coalesce(v_room.autoplay, false) then
    -- Prefer songs you haven't heard in the last few plays; fall back to anything but the current one.
    select h.video_id, h.title, h.channel, h.thumbnail, h.duration_sec, h.played_by into v_pick
    from (
      select distinct on (video_id) video_id, title, channel, thumbnail, duration_sec, played_by
      from public.play_history
      where room_id = p_room and video_id <> coalesce(p_from_video, '')
      order by video_id, played_at desc
    ) h
    order by (h.video_id in (select video_id from public.play_history where room_id = p_room order by played_at desc limit 5)), random()
    limit 1;

    if v_pick.video_id is not null then
      return public._apply_playback(p_room, v_pick.video_id, v_pick.title, v_pick.channel, v_pick.thumbnail,
        v_pick.duration_sec, v_pick.played_by, true, 0, '✨ Autoplay: ' || coalesce(v_pick.title, 'a song you both played'));
    end if;
  end if;

  update public.playback_state
    set is_playing = false,
        position_sec = coalesce(duration_sec, position_sec + case when is_playing then extract(epoch from clock_timestamp() - updated_at) else 0 end),
        updated_at = clock_timestamp(),
        updated_by = auth.uid()
    where room_id = p_room
    returning * into v_state;
  return v_state;
end;
$$;

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
  if not found or not public.is_room_member(v_item.room_id) then raise exception 'NOT_FOUND'; end if;
  update public.queue_items set status = 'played' where id = p_item;
  return public._apply_playback(v_item.room_id, v_item.video_id, v_item.title, v_item.channel, v_item.thumbnail,
    v_item.duration_sec, v_item.added_by, true, 0, null);
end;
$$;

-- ---------------------------------------------------------------------
-- Push notifications
-- ---------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push_own" on public.push_subscriptions;
create policy "push_own" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Photos & voice notes: private storage, only the room's two members
-- (files live at duet-media/<room_id>/<file>)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('duet-media', 'duet-media', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
              'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/aac', 'audio/x-m4a'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.media_room_member(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_room_member(
    case when split_part(p_name, '/', 1) ~ '^[0-9a-f-]{36}$' then split_part(p_name, '/', 1)::uuid end
  );
$$;

drop policy if exists "duet_media_read" on storage.objects;
drop policy if exists "duet_media_write" on storage.objects;
create policy "duet_media_read" on storage.objects for select to authenticated
  using (bucket_id = 'duet-media' and public.media_room_member(name));
create policy "duet_media_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'duet-media' and public.media_room_member(name));

-- ---------------------------------------------------------------------
-- Realtime: live room settings (theme, rename, schedule)
-- ---------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms') then
    alter publication supabase_realtime add table public.rooms;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_songs') then
    alter publication supabase_realtime add table public.room_songs;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Grants + version marker (the app turns the new features on when it sees 2)
-- ---------------------------------------------------------------------
revoke execute on function public.edit_message(uuid, text) from public, anon;
revoke execute on function public.delete_message(uuid) from public, anon;
revoke execute on function public.reorder_queue(uuid, uuid[]) from public, anon;
revoke execute on function public.room_history(uuid) from public, anon;
revoke execute on function public.add_listen_time(uuid, int) from public, anon;
revoke execute on function public.update_room_settings(uuid, jsonb) from public, anon;
grant execute on function public.edit_message(uuid, text) to authenticated;
grant execute on function public.delete_message(uuid) to authenticated;
grant execute on function public.reorder_queue(uuid, uuid[]) to authenticated;
grant execute on function public.room_history(uuid) to authenticated;
grant execute on function public.add_listen_time(uuid, int) to authenticated;
grant execute on function public.update_room_settings(uuid, jsonb) to authenticated;

create or replace function public.duet_schema_version()
returns int
language sql
immutable
as $$ select 2 $$;
grant execute on function public.duet_schema_version() to anon, authenticated;
