-- Duet v6 — couple games (chess, ludo, tic-tac-toe, connect four, would you rather,
-- most likely to, truth or dare). Safe to run more than once.

create table if not exists public.games (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms (id) on delete cascade,
  kind        text not null check (kind in ('chess', 'ludo', 'ttt', 'connect4', 'wyr', 'mlt', 'tod')),
  state       jsonb not null,
  status      text not null default 'active' check (status in ('active', 'done', 'ended')),
  version     int not null default 0,
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists games_room_idx on public.games (room_id, created_at desc);

alter table public.games enable row level security;
drop policy if exists "games_select" on public.games;
create policy "games_select" on public.games for select to authenticated using (public.is_room_member(room_id));
drop policy if exists "games_insert" on public.games;
create policy "games_insert" on public.games for insert to authenticated
  with check (public.is_room_member(room_id) and created_by = auth.uid() and version = 0);
grant select, insert on public.games to authenticated;

-- A move: only applies if nobody else moved in between (version check), so two
-- phones can never overwrite each other.
create or replace function public.game_move(p_game uuid, p_version int, p_state jsonb, p_status text)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games;
begin
  select * into v_game from public.games where id = p_game for update;
  if not found or not public.is_room_member(v_game.room_id) then raise exception 'NOT_FOUND'; end if;
  if v_game.version <> p_version then raise exception 'STALE'; end if;
  if p_status not in ('active', 'done', 'ended') then raise exception 'BAD_STATUS'; end if;
  update public.games
     set state = p_state, status = p_status, version = version + 1, updated_at = now()
   where id = p_game
  returning * into v_game;
  return v_game;
end;
$$;
revoke execute on function public.game_move(uuid, int, jsonb, text) from public, anon;
grant  execute on function public.game_move(uuid, int, jsonb, text) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'games') then
    alter publication supabase_realtime add table public.games;
  end if;
end $$;

-- Chat card when a game starts ("🎮 Pajju started Chess — Join").
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'system', 'sticker', 'image', 'voice', 'moment', 'dedication', 'poll', 'game'));
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert to authenticated
  with check (
    public.is_room_member(room_id)
    and user_id = auth.uid()
    and kind in ('text', 'sticker', 'image', 'voice', 'moment', 'dedication', 'poll', 'game')
    and edited_at is null and deleted_at is null
    and (
      reply_to is null
      or exists (select 1 from public.messages m where m.id = messages.reply_to and m.room_id = messages.room_id)
    )
  );

create or replace function public.duet_schema_version()
returns int language sql immutable as $$ select 6 $$;
grant execute on function public.duet_schema_version() to anon, authenticated;
