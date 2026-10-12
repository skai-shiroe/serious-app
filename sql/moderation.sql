-- =============================================================
-- MODERATION - SIGNALER / BLOQUER (bloc 9)
-- A coller dans Supabase -> SQL Editor. Idempotent : re-executable
-- sans risque. Bloquant pour les stores (Play + Apple exigent le
-- signalement et le blocage dans toute app de rencontre).
--
-- Regles :
--  - un blocage est BILATERAL : A ne voit plus B, B ne voit plus A
--    (deck, conversations, envoi) ;
--  - un signalement n'empeche rien tout seul : il alimente la file
--    admin (app/admin/reports.tsx) ;
--  - seul l'admin peut changer le statut d'un signalement.
-- =============================================================

-- 1) Blocages (composite PK = pas de doublon possible)
create table if not exists public.user_blocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_user_id),
  check (user_id <> blocked_user_id)
);
create index if not exists user_blocks_blocked_idx
  on public.user_blocks (blocked_user_id);

-- 2) Signalements (audit : qui, qui, pourquoi, statut)
create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in (
    'fake', 'harassment', 'inappropriate', 'spam', 'other'
  )),
  details text,
  status text not null default 'pending'
    check (status in ('pending', 'reviewed', 'dismissed')),
  reviewer_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_user_id)
);
create index if not exists user_reports_pending_idx
  on public.user_reports (status, created_at desc) where status = 'pending';
create index if not exists user_reports_reported_idx
  on public.user_reports (reported_user_id);

-- 3) RLS : chacun ne gere que SES blocages / signalements
alter table public.user_blocks enable row level security;
alter table public.user_reports enable row level security;

drop policy if exists blocks_select on public.user_blocks;
create policy blocks_select on public.user_blocks for select
  using (user_id = auth.uid());

drop policy if exists blocks_insert on public.user_blocks;
create policy blocks_insert on public.user_blocks for insert
  with check (user_id = auth.uid());

drop policy if exists blocks_delete on public.user_blocks;
create policy blocks_delete on public.user_blocks for delete
  using (user_id = auth.uid());
-- Aucune policy UPDATE : on bloque / debloque, on ne modifie pas.

drop policy if exists reports_select on public.user_reports;
create policy reports_select on public.user_reports for select
  using (reporter_id = auth.uid() or public.is_admin());

drop policy if exists reports_insert on public.user_reports;
create policy reports_insert on public.user_reports for insert
  with check (reporter_id = auth.uid());

-- Seul l'admin fait avancer le statut (jamais le contenu).
drop policy if exists reports_admin_update on public.user_reports;
create policy reports_admin_update on public.user_reports for update
  using (public.is_admin())
  with check (public.is_admin());

-- 4) Deck : les bloques (dans les 2 sens) ne se voient plus.
-- Meme signature a 8 arguments : `create or replace` suffit, aucun
-- changement cote app (lib/candidates.ts appelle comme avant).
create or replace function get_candidate_profiles(
  p_limit integer default 30,
  p_after uuid default null,
  p_gender text default null,
  p_city text default null,
  p_blood_type text default null,
  p_sickle_cell text default null,
  p_age_min integer default null,
  p_age_max integer default null
)
returns setof profiles
language sql stable
as $$
  select p.*
  from profiles p
  where p.user_id <> auth.uid()
    and not exists (
      select 1 from swipes s
      where s.swiper_id = auth.uid()
        and s.swiped_id = p.user_id
    )
    -- Moderation : blocage bilateral (bloqueur OU bloque = invisible).
    and not exists (
      select 1 from user_blocks b
      where (b.user_id = auth.uid() and b.blocked_user_id = p.user_id)
         or (b.user_id = p.user_id and b.blocked_user_id = auth.uid())
    )
    and (p_after is null or p.user_id > p_after)
    -- Matching strict : un profil ne voit QUE le genre oppose.
    and (p_gender is null or lower(p.gender) = lower(p_gender))
    and (p_city is null or p.city ilike '%' || p_city || '%')
    and (p_blood_type is null or p.blood_type = p_blood_type)
    and (p_sickle_cell is null or p.sickle_cell = p_sickle_cell)
    -- Age en annees revolues : equivalent exact du calculateAge de l'app.
    and (
      p.birth_date is null
      or (
        date_part('year', age(p.birth_date::date)) >= coalesce(p_age_min, 0)
        and date_part('year', age(p.birth_date::date)) <= coalesce(p_age_max, 200)
      )
    )
  order by p.user_id
  limit greatest(p_limit, 1);
$$;

revoke execute on function get_candidate_profiles(integer, uuid, text, text, text, text, integer, integer) from public;
grant execute on function get_candidate_profiles(integer, uuid, text, text, text, text, integer, integer) to authenticated;

-- 5) Controles : les 2 tables + les 6 policies doivent exister
select tablename from pg_tables
where schemaname = 'public' and tablename in ('user_blocks', 'user_reports');

select policyname from pg_policies
where schemaname = 'public'
  and tablename in ('user_blocks', 'user_reports')
order by tablename, policyname;
