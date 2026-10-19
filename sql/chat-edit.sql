-- ══════════════════════════════════════════════════════════════════════
-- BLOC 14 — Messages : édition, suppression douce, réponse (citation)
--   • edited_at    : horodatage de la dernière édition (affichage « modifié »)
--   • is_deleted   : suppression SOFT — la ligne reste (modération/admin),
--                    l'app affiche « Message supprimé » ; purge sur
--                    « Supprimer mon compte »
--   • reply_to_id  : message cité (barre de citation WhatsApp)
-- Les accuses de lecture passent par une RPC limitee au match du demandeur.
-- La policy UPDATE de lecture a ete retiree : RLS ne limite pas une policy
-- UPDATE a certaines colonnes et autorisait donc la modification des messages
-- de l'autre participant.
-- Idempotent : exécutable plusieurs fois.
-- ══════════════════════════════════════════════════════════════════════

alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists is_deleted boolean not null default false;
alter table public.messages add column if not exists reply_to_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_reply_to_id_fkey'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_reply_to_id_fkey
      foreign key (reply_to_id) references public.messages(id)
      on delete set null;
  end if;
end $$;

alter table public.messages enable row level security;

-- L'envoi et la modification sont limites aux messages d'un match auquel
-- l'utilisateur participe.
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
  );

-- Retire l'ancienne policy trop large. Les recus de lecture sont mis a jour
-- exclusivement par mark_match_messages_read(uuid), ci-dessous.
drop policy if exists "Users can mark messages as read" on public.messages;

-- Éditer / supprimer (soft) : uniquement ses propres messages dans un match
-- auquel il participe. La citation doit appartenir a ce meme match.
drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own" on public.messages
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
    and (
      reply_to_id is null
      or exists (
        select 1 from public.messages quoted
        where quoted.id = messages.reply_to_id
          and quoted.match_id = messages.match_id
      )
    )
  );

-- Les UPDATE directs ne peuvent toucher qu'aux colonnes de son propre message.
-- Le champ read est exclu et ne change que via la RPC ci-dessous.
revoke update on table public.messages from public, anon, authenticated;
revoke update (id, match_id, sender_id, content, created_at, read, edited_at, is_deleted, reply_to_id)
  on table public.messages from public, anon, authenticated;
grant update (content, edited_at, is_deleted, reply_to_id)
  on table public.messages to authenticated;

create or replace function public.mark_match_messages_read(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.matches m
    where m.id = p_match_id
      and (m.user_id_1 = v_user or m.user_id_2 = v_user)
  ) then
    raise exception 'not allowed';
  end if;

  update public.messages
     set read = true
   where match_id = p_match_id
     and sender_id <> v_user
     and read is distinct from true;
end $$;

revoke execute on function public.mark_match_messages_read(uuid) from public, anon;
grant execute on function public.mark_match_messages_read(uuid) to authenticated;

-- Vérif : les 3 colonnes doivent exister (0 ligne manquante attendue).
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'messages'
  and column_name in ('edited_at', 'is_deleted', 'reply_to_id')
order by 1;
