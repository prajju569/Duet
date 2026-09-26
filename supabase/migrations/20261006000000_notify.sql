-- Duet v7 — fun notifications that the server sends on its own:
--   • "Send later" messages buzz your partner when they're delivered
--   • once a day (7 PM India time): countdown reminders, "it's been quiet", milestones
-- The database pokes Duet's /api/cron (via pg_net) with a secret only it and the server know.

-- What we've already sent (so nothing buzzes twice).
create table if not exists public.notify_log (
  room_id    uuid not null references public.rooms (id) on delete cascade,
  key        text not null,
  created_at timestamptz not null default now(),
  primary key (room_id, key)
);
alter table public.notify_log enable row level security; -- no policies: server only
revoke all on public.notify_log from anon, authenticated;

-- Private settings (server only).
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);
alter table public.app_config enable row level security; -- no policies: server only
revoke all on public.app_config from anon, authenticated;
insert into public.app_config (key, value) values ('cron_secret', gen_random_uuid()::text) on conflict (key) do nothing;
insert into public.app_config (key, value) values ('cron_url', 'https://duet-phi-tan.vercel.app/api/cron') on conflict (key) do nothing;

do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  begin
    create extension if not exists pg_net;
  exception when others then raise notice 'pg_net unavailable: server-side notifications are off';
  end;
end $$;

-- Poke Duet's server. Never fails the caller.
create or replace function public.duet_ping(p_body jsonb)
returns void language plpgsql security definer set search_path = public
as $$
declare v_url text; v_secret text;
begin
  select value into v_url from public.app_config where key = 'cron_url';
  select value into v_secret from public.app_config where key = 'cron_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url := v_url,
    body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-duet-cron', v_secret),
    timeout_milliseconds := 5000
  );
exception when others then
  raise notice 'duet_ping failed: %', sqlerrm;
end;
$$;
revoke execute on function public.duet_ping(jsonb) from public, anon, authenticated;

-- Same as before, plus: tell the server which messages just went out so it can buzz.
create or replace function public.deliver_due_messages()
returns int language plpgsql security definer set search_path = public
as $$
declare ids jsonb;
begin
  with due as (
    delete from public.scheduled_messages where send_at <= now() returning *
  ), sent as (
    insert into public.messages (room_id, user_id, kind, body, created_at, meta)
    select d.room_id, d.user_id, 'text', d.body, d.send_at, jsonb_build_object('scheduled', true)
    from due d
    where exists (select 1 from public.room_members m where m.room_id = d.room_id and m.user_id = d.user_id)
    returning id
  )
  select coalesce(jsonb_agg(id), '[]'::jsonb) into ids from sent;
  if jsonb_array_length(ids) > 0 then
    perform public.duet_ping(jsonb_build_object('kind', 'scheduled', 'ids', ids));
  end if;
  return jsonb_array_length(ids);
end;
$$;
revoke execute on function public.deliver_due_messages() from public, anon;
grant  execute on function public.deliver_due_messages() to authenticated;

-- Daily fun at 7 PM IST (13:30 UTC).
do $$
begin
  perform cron.schedule('duet-daily', '30 13 * * *', $c$select public.duet_ping('{"kind":"daily"}'::jsonb)$c$);
exception when others then
  raise notice 'pg_cron unavailable: daily notifications are off';
end $$;

create or replace function public.duet_schema_version()
returns int language sql immutable as $$ select 7 $$;
grant execute on function public.duet_schema_version() to anon, authenticated;
