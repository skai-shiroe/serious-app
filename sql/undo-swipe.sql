-- ══════════════════════════════════════════════════════════════════════
-- BLOC 13 — Annulation de swipe (bouton « Annuler » du deck)
-- Aujourd'hui `swipes` n'a que INSERT/SELECT : l'undo nécessite DELETE own.
-- Si un swipe a créé un match, le match est supprimé aussi (un participant
-- doit pouvoir supprimer le match).
-- Idempotent : `drop policy if exists` + nettoyage d'une éventuelle policy
-- DELETE déjà présente (le plan de départ en prévoit aucune) pour rester
-- déterministe : une seule policy DELETE par table, la notre.
-- À exécuter AVANT l'OTA du bundle contenant le bouton Annuler.
-- ══════════════════════════════════════════════════════════════════════

alter table public.swipes enable row level security;
alter table public.matches enable row level security;

-- Privilege DELETE (les templates Supabase accordent deja ALL, no-op sinon).
grant delete on public.swipes to authenticated;
grant delete on public.matches to authenticated;

-- ── swipes : seul l'auteur du swipe peut le retirer ───────────────────
drop policy if exists "swipes_delete_own" on public.swipes;
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public'
      and tablename = 'swipes'
      and cmd = 'DELETE'
      and policyname <> 'swipes_delete_own'
  loop
    execute format('drop policy %I on public.swipes', pol.policyname);
  end loop;
end $$;

create policy "swipes_delete_own" on public.swipes
  for delete to authenticated
  using (swiper_id = auth.uid());

-- ── matches : un participant peut retirer le match (annulation) ───────
drop policy if exists "matches_delete_participant" on public.matches;
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public'
      and tablename = 'matches'
      and cmd = 'DELETE'
      and policyname <> 'matches_delete_participant'
  loop
    execute format('drop policy %I on public.matches', pol.policyname);
  end loop;
end $$;

create policy "matches_delete_participant" on public.matches
  for delete to authenticated
  using (auth.uid() in (user_id_1, user_id_2));
