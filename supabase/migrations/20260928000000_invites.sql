-- Duet — personal invite links ("type their name, share the link")
-- Paste into Supabase → SQL Editor → Run (safe to run more than once).

create table if not exists public.room_invites (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms (id) on delete cascade,
  token_hash    text not null unique,            -- sha256 of the link token; the token itself is never stored
  invitee_name  text not null check (char_length(invitee_name) between 1 and 40),
  created_by    uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '7 days',
  used_by       uuid references auth.users (id) on delete set null,
  used_at       timestamptz
);
create index if not exists room_invites_room_idx on public.room_invites (room_id);
alter table public.room_invites enable row level security;
-- No policies: only the functions below touch this table.

-- Create a one-time invite link for the empty seat in your room. Returns the raw token.
create or replace function public.create_invite(p_room uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
begin
  if not public.is_room_member(p_room) then raise exception 'NOT_A_MEMBER'; end if;
  if (select count(*) from public.room_members where room_id = p_room) >= 2 then raise exception 'ROOM_FULL'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'NAME_REQUIRED'; end if;

  -- One live invite per room: a new link replaces the old one.
  delete from public.room_invites where room_id = p_room and used_at is null;

  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  insert into public.room_invites (room_id, token_hash, invitee_name, created_by)
  values (p_room, encode(extensions.digest(v_token, 'sha256'), 'hex'), left(trim(p_name), 40), auth.uid());
  return v_token;
end;
$$;

-- What the invite page shows before anyone taps Join (safe for link-preview bots: changes nothing).
create or replace function public.invite_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_inv public.room_invites;
  v_from text;
begin
  select * into v_inv from public.room_invites
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then return jsonb_build_object('status', 'invalid'); end if;

  select coalesce(display_name, 'Someone') into v_from from public.profiles where id = v_inv.created_by;
  return jsonb_build_object(
    'status', case
      when v_inv.used_at is not null then 'used'
      when v_inv.expires_at < now() then 'expired'
      else 'ok' end,
    'from', coalesce(v_from, 'Someone'),
    'to', v_inv.invitee_name,
    'used_by_me', v_inv.used_by is not null and v_inv.used_by = auth.uid()
  );
end;
$$;

-- Accept the invite as the signed-in user: sets your name, joins the room, burns the link.
create or replace function public.redeem_invite(p_token text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_inv  public.room_invites;
  v_code text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_inv from public.room_invites
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;
  if not found then raise exception 'INVITE_INVALID'; end if;

  select code into v_code from public.rooms where id = v_inv.room_id;

  -- Already in this room (e.g. the inviter testing their own link): just open it, keep the invite alive.
  if exists (select 1 from public.room_members where room_id = v_inv.room_id and user_id = auth.uid()) then
    return v_code;
  end if;

  if v_inv.used_at is not null then
    if v_inv.used_by = auth.uid() then return v_code; end if; -- tapping your own used link again is fine
    raise exception 'INVITE_USED';
  end if;
  if v_inv.expires_at < now() then raise exception 'INVITE_EXPIRED'; end if;

  update public.profiles set display_name = coalesce(display_name, v_inv.invitee_name) where id = auth.uid();

  insert into public.room_members (room_id, user_id) values (v_inv.room_id, auth.uid()); -- trigger enforces max 2

  update public.room_invites set used_by = auth.uid(), used_at = now() where id = v_inv.id;
  return v_code;
end;
$$;

revoke execute on function public.create_invite(uuid, text) from public, anon;
grant  execute on function public.create_invite(uuid, text) to authenticated;
revoke execute on function public.invite_preview(text) from public;
grant  execute on function public.invite_preview(text) to anon, authenticated;
revoke execute on function public.redeem_invite(text) from public, anon;
grant  execute on function public.redeem_invite(text) to authenticated;

-- While holding a valid, unused invite: does this Duet ID already exist?
-- (Only invite holders can ask, so IDs can't be fished for from the open internet.)
create or replace function public.invite_username_exists(p_token text, p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_inv public.room_invites;
begin
  select * into v_inv from public.room_invites
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found or v_inv.used_at is not null or v_inv.expires_at < now() then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true, 'exists',
    exists (select 1 from public.profiles where username = lower(trim(p_username))));
end;
$$;
revoke execute on function public.invite_username_exists(text, text) from public;
grant  execute on function public.invite_username_exists(text, text) to anon, authenticated;
