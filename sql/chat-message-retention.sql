-- Chat message actions: four-hour edit/global-delete window and per-sender hide.
alter table public.messages
  add column if not exists hidden_for_sender boolean not null default false;

grant update (hidden_for_sender) on public.messages to authenticated;

-- Avoid recursive RLS: the old message UPDATE policy queried messages from
-- its own WITH CHECK expression while PostgreSQL was already checking messages.
create or replace function public.message_reply_belongs_to_match(p_reply_id uuid, p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.matches m
    join public.messages quoted on quoted.id = p_reply_id and quoted.match_id = m.id
    where m.id = p_match_id
      and (m.user_id_1 = auth.uid() or m.user_id_2 = auth.uid())
  );
$$;
revoke all on function public.message_reply_belongs_to_match(uuid, uuid) from public, anon;
grant execute on function public.message_reply_belongs_to_match(uuid, uuid) to authenticated;

drop policy if exists "Users can send messages" on public.messages;
create policy "Users can send messages" on public.messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.matches m
    where m.id = messages.match_id
      and (m.user_id_1 = (select auth.uid()) or m.user_id_2 = (select auth.uid()))
  )
  and (reply_to_id is null or public.message_reply_belongs_to_match(reply_to_id, match_id))
);

drop policy if exists messages_update_own on public.messages;
create policy messages_update_own on public.messages
for update to authenticated
using (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.matches m
    where m.id = messages.match_id
      and (m.user_id_1 = (select auth.uid()) or m.user_id_2 = (select auth.uid()))
  )
)
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.matches m
    where m.id = messages.match_id
      and (m.user_id_1 = (select auth.uid()) or m.user_id_2 = (select auth.uid()))
  )
  and (reply_to_id is null or public.message_reply_belongs_to_match(reply_to_id, match_id))
);

create or replace function public.guard_chat_message_actions()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_cutoff timestamptz := old.created_at::timestamptz + interval '4 hours';
begin
  -- The read-receipt RPC is allowed to update only `read` on a partner's row.
  if new.read is distinct from old.read
    and new.id is not distinct from old.id
    and new.match_id is not distinct from old.match_id
    and new.sender_id is not distinct from old.sender_id
    and new.content is not distinct from old.content
    and new.created_at is not distinct from old.created_at
    and new.edited_at is not distinct from old.edited_at
    and new.is_deleted is not distinct from old.is_deleted
    and new.hidden_for_sender is not distinct from old.hidden_for_sender
    and new.reply_to_id is not distinct from old.reply_to_id then
    return new;
  end if;

  if auth.uid() is null or old.sender_id is distinct from auth.uid() then
    raise exception 'Seul l’expéditeur peut modifier ou supprimer ce message';
  end if;
  if old.is_deleted then
    raise exception 'Ce message a déjà été supprimé pour tout le monde';
  end if;
  if new.id is distinct from old.id
    or new.match_id is distinct from old.match_id
    or new.sender_id is distinct from old.sender_id
    or new.created_at is distinct from old.created_at
    or new.read is distinct from old.read
    or new.reply_to_id is distinct from old.reply_to_id then
    raise exception 'Les informations du message ne peuvent pas être modifiées';
  end if;

  if new.content is distinct from old.content then
    if old.created_at is null or v_now > v_cutoff then
      raise exception 'La modification du message est autorisée pendant 4 heures';
    end if;
    if new.is_deleted is distinct from old.is_deleted or new.hidden_for_sender is distinct from old.hidden_for_sender then
      raise exception 'Une seule action peut être effectuée à la fois';
    end if;
    new.edited_at := v_now;
  elsif new.edited_at is distinct from old.edited_at then
    raise exception 'La date de modification est gérée par le serveur';
  end if;

  if new.is_deleted is distinct from old.is_deleted then
    if not new.is_deleted then
      raise exception 'Un message supprimé pour tous ne peut pas être restauré';
    end if;
    if old.created_at is null or v_now > v_cutoff then
      raise exception 'La suppression pour tout le monde est autorisée pendant 4 heures';
    end if;
    if new.content is distinct from old.content or new.hidden_for_sender is distinct from old.hidden_for_sender then
      raise exception 'Une seule action peut être effectuée à la fois';
    end if;
  end if;

  if new.hidden_for_sender is distinct from old.hidden_for_sender then
    if not new.hidden_for_sender then
      raise exception 'Un message masqué ne peut pas être restauré';
    end if;
    if new.content is distinct from old.content or new.is_deleted is distinct from old.is_deleted then
      raise exception 'Une seule action peut être effectuée à la fois';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_chat_message_actions on public.messages;
create trigger guard_chat_message_actions
before update on public.messages
for each row execute function public.guard_chat_message_actions();

revoke all on function public.guard_chat_message_actions() from public, anon, authenticated;

-- Realtime UPDATEs are needed so a global deletion disappears for both people.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;
