-- Duet — username + 6-digit PIN login
-- Paste into Supabase → SQL Editor → Run (safe to run more than once).
--
-- The PIN itself is never stored. The server turns it into a long secret
-- (HMAC with a server-only key) and that becomes the account's Supabase password.

alter table public.profiles
  add column if not exists username text;

do $$ begin
  alter table public.profiles
    add constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_.]{3,20}$');
exception when duplicate_object then null; end $$;

create unique index if not exists profiles_username_key on public.profiles (username);

-- Failed-attempt tracking for the lockout. No policies = nobody can read it directly.
create table if not exists public.pin_attempts (
  username      text primary key,
  failures      int not null default 0,
  locked_until  timestamptz
);
alter table public.pin_attempts enable row level security;

-- Checks a username + derived secret. Returns the account email only when correct.
-- 5 wrong tries → locked for 15 minutes. Never raises, so the counter always saves.
create or replace function public.pin_login_check(p_username text, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text := lower(trim(p_username));
  v_attempt  public.pin_attempts;
  v_email    text;
  v_hash     text;
begin
  insert into public.pin_attempts (username) values (v_username) on conflict do nothing;
  select * into v_attempt from public.pin_attempts where username = v_username for update;

  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'LOCKED',
      'retry_after', ceil(extract(epoch from v_attempt.locked_until - now())));
  end if;

  select u.email, u.encrypted_password into v_email, v_hash
  from public.profiles p join auth.users u on u.id = p.id
  where p.username = v_username;

  if v_hash is null or v_hash = '' or extensions.crypt(p_secret, v_hash) <> v_hash then
    update public.pin_attempts
      set failures = failures + 1,
          locked_until = case when failures + 1 >= 5 then now() + interval '15 minutes' else null end
      where username = v_username
      returning * into v_attempt;
    if v_attempt.locked_until is not null then
      update public.pin_attempts set failures = 0 where username = v_username;
      return jsonb_build_object('ok', false, 'error', 'LOCKED', 'retry_after', 900);
    end if;
    return jsonb_build_object('ok', false, 'error', 'INVALID', 'tries_left', 5 - v_attempt.failures);
  end if;

  update public.pin_attempts set failures = 0, locked_until = null where username = v_username;
  return jsonb_build_object('ok', true, 'email', v_email);
end;
$$;

revoke execute on function public.pin_login_check(text, text) from public;
grant execute on function public.pin_login_check(text, text) to anon, authenticated;

-- Is a username free? (for the setup form)
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles where username = lower(trim(p_username)) and id <> auth.uid()
  );
$$;
revoke execute on function public.username_available(text) from public, anon;
grant execute on function public.username_available(text) to authenticated;
