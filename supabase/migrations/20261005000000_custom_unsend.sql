-- Duet — per-account "unsend" text (a private feature flag, off for everyone).
-- When an account has deleted_label set, messages it unsends show that text instead of
-- "Message deleted". Users can't set it themselves — only you, from this SQL editor.

alter table public.profiles add column if not exists deleted_label text
  check (deleted_label is null or char_length(deleted_label) between 1 and 80);

-- People may only edit their own name + Duet ID — never special settings like this one.
revoke insert, update, delete, truncate on public.profiles from anon, authenticated;
grant update (display_name, username) on public.profiles to authenticated;

create or replace function public.delete_message(p_id uuid)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg public.messages;
  v_label text;
begin
  select * into v_msg from public.messages where id = p_id for update;
  if not found or v_msg.user_id is distinct from auth.uid() or v_msg.kind = 'system' then raise exception 'NOT_ALLOWED'; end if;
  select deleted_label into v_label from public.profiles where id = auth.uid();
  update public.messages
    set body = coalesce(nullif(trim(v_label), ''), 'Message deleted'), meta = null, deleted_at = now()
    where id = p_id returning * into v_msg;
  return v_msg;
end;
$$;
