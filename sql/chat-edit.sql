-- ══════════════════════════════════════════════════════════════════════
-- BLOC 14 — Messages : édition, suppression douce, réponse (citation)
--   • edited_at    : horodatage de la dernière édition (affichage « modifié »)
--   • is_deleted   : suppression SOFT — la ligne reste (modération/admin),
--                    l'app affiche « Message supprimé » ; purge sur
--                    « Supprimer mon compte »
--   • reply_to_id  : message cité (barre de citation WhatsApp)
-- Policy UPDATE : AJOUTATIVE — elle s'ajoute en OR à celle(s) existante(s)
-- qui gèrent le passage à « lu » par le destinataire ; rien n'est écrasé.
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

-- Éditer / supprimer (soft) : uniquement ses propres messages.
drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own" on public.messages
  for update to authenticated
  using (auth.uid() = sender_id)
  with check (auth.uid() = sender_id);

-- Vérif : les 3 colonnes doivent exister (0 ligne manquante attendue).
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'messages'
  and column_name in ('edited_at', 'is_deleted', 'reply_to_id')
order by 1;
