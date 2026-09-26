-- Duet v8 — everyone can pick their own "unsend" text (what the other person sees
-- instead of "Message deleted"). Read / written only through these two functions,
-- so nobody can read or change anyone else's.

create or replace function public.my_deleted_label()
returns text language sql stable security definer set search_path = public
as $$ select deleted_label from public.profiles where id = auth.uid() $$;
revoke execute on function public.my_deleted_label() from public, anon;
grant  execute on function public.my_deleted_label() to authenticated;

create or replace function public.set_deleted_label(p_label text)
returns text language plpgsql security definer set search_path = public
as $$
declare v text := nullif(regexp_replace(trim(coalesce(p_label, '')), '\s+', ' ', 'g'), '');
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  if v is not null and char_length(v) > 60 then raise exception 'TOO_LONG'; end if;
  update public.profiles set deleted_label = v where id = auth.uid();
  return v;
end;
$$;
revoke execute on function public.set_deleted_label(text) from public, anon;
grant  execute on function public.set_deleted_label(text) to authenticated;

create or replace function public.duet_schema_version()
returns int language sql immutable as $$ select 8 $$;
grant execute on function public.duet_schema_version() to anon, authenticated;
