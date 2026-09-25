-- Duet — swipe-to-reply
-- Paste into Supabase → SQL Editor → Run (safe to run more than once).

alter table public.messages
  add column if not exists reply_to uuid references public.messages (id) on delete set null;

-- A reply must point at a message in the same room.
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert to authenticated
  with check (
    public.is_room_member(room_id)
    and user_id = auth.uid()
    and kind = 'text'
    and (
      reply_to is null
      or exists (select 1 from public.messages m where m.id = messages.reply_to and m.room_id = messages.room_id)
    )
  );
