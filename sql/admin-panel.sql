-- =============================================================
-- PANEL WEB - fondations SQL (bloc 10)
-- A coller dans Supabase -> SQL Editor. Idempotent : re-executable
-- sans risque. Alimente le dashboard Next.js (admin-web/).
--
-- Regles :
--  - toutes les fonctions admin sont `security definer` et verifient
--    elles-memes `public.is_admin()` (role admin/manager) ;
--  - rien n est ouvert a `anon` : le panneau a besoin d un compte
--    connecte avec un role admin, rien d autre ;
--  - le ban administratif est nouveau : `profiles.banned_at` +
--    `admin_set_banned()` ; un banni disparait du deck et ne peut
--    pas se debanquer lui-meme (trigger de garde).
-- =============================================================

-- 1) Ban administratif sur les profils
alter table public.profiles
  add column if not exists banned_at timestamptz,
  add column if not exists banned_reason text;

comment on column public.profiles.banned_at is
  'Ban admin (null = actif). Pose/administre uniquement par admin_set_banned().';
comment on column public.profiles.banned_reason is
  'Motif du ban, affiche dans le panneau admin.';

-- created_at sur profiles : requis par les stats d inscriptions.
-- Si la colonne manquait, elle est creee maintenant (les comptes
-- existants sont datees de l execution : stats approximatives).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'created_at'
  ) then
    alter table public.profiles
      add column created_at timestamptz not null default now();
    raise notice 'profiles.created_at cree maintenant (backfill = maintenant)';
  end if;
end $$;

-- 2) Ban / deban en une seule fonction (audit + interdiction de
--    bannir un autre admin).
create or replace function public.admin_set_banned(
  p_user uuid, p_banned boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  if p_user is null or p_user = auth.uid() then
    raise exception 'cible invalide';
  end if;
  if exists (
    select 1 from public.profiles
    where user_id = p_user and role in ('admin', 'manager')
  ) then
    raise exception 'impossible de bannir un administrateur';
  end if;
  if p_banned and coalesce(trim(p_reason), '') = '' then
    raise exception 'motif de ban obligatoire';
  end if;

  update public.profiles
     set banned_at = case when p_banned then now() else null end,
         banned_reason = case when p_banned then p_reason else null end
   where user_id = p_user;
  if not found then
    raise exception 'profil introuvable';
  end if;
end $$;

-- 3) Garde : un utilisateur normal ne peut pas effacer son propre
--    ban en UPDATE sur son profil (la policy UPDATE existe deja).
--    SECURITY INVOKER volontaire : current_user doit refleter l auteur
--    reel de l UPDATE (authenticated vs postgres / service_role).
create or replace function public.profiles_ban_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;
  if not public.is_admin()
     and (new.banned_at is distinct from old.banned_at
       or new.banned_reason is distinct from old.banned_reason) then
    new.banned_at := old.banned_at;
    new.banned_reason := old.banned_reason;
  end if;
  return new;
end $$;

drop trigger if exists profiles_ban_guard on public.profiles;
create trigger profiles_ban_guard
before update on public.profiles
for each row execute function public.profiles_ban_guard();

-- 4) Deck : les profils bannis disparaissent (meme signature que
--    lib/candidates.ts appelle deja : create or replace suffit).
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
    and p.banned_at is null
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
    -- Age en annees revolues : equivalent exact du calculateAge de l app.
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

-- 5) Stats globales en UN appel (cartes KPI du dashboard).
create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  return (select jsonb_build_object(
    'profiles_total',      (select count(*) from public.profiles),
    'profiles_7d',         (select count(*) from public.profiles
                            where created_at >= now() - interval '7 days'),
    'profiles_30d',        (select count(*) from public.profiles
                            where created_at >= now() - interval '30 days'),
    'verified_total',      (select count(*) from public.profiles
                            where identity_verified or genotype_verified),
    'banned_total',        (select count(*) from public.profiles
                            where banned_at is not null),
    'verifications_pending', (select count(*) from public.verifications
                              where status = 'pending'),
    'verifications_30d',   (select count(*) from public.verifications
                            where created_at >= now() - interval '30 days'),
    'reports_pending',     (select count(*) from public.user_reports
                            where status = 'pending'),
    'reports_30d',         (select count(*) from public.user_reports
                            where created_at >= now() - interval '30 days'),
    'matches_total',       (select count(*) from public.matches),
    'matches_7d',          (select count(*) from public.matches
                            where created_at >= now() - interval '7 days'),
    'matches_30d',         (select count(*) from public.matches
                            where created_at >= now() - interval '30 days'),
    'messages_total',      (select count(*) from public.messages),
    'messages_7d',         (select count(*) from public.messages
                            where created_at >= now() - interval '7 days'),
    'messages_30d',        (select count(*) from public.messages
                            where created_at >= now() - interval '30 days'),
    'swipes_7d',           (select count(*) from public.swipes
                            where created_at >= now() - interval '7 days'),
    'likes_7d',            (select count(*) from public.swipes
                            where created_at >= now() - interval '7 days'
                              and direction = 'like'),
    'profiles_liked_7d',   (select count(distinct swiped_id) from public.swipes
                            where created_at >= now() - interval '7 days'
                              and direction = 'like'),
    'coaching_posts',      (select count(*) from public.coaching_posts),
    'coaching_likes_30d',  (select count(*) from public.coaching_likes
                            where created_at >= now() - interval '30 days'),
    'coaching_comments_30d', (select count(*) from public.coaching_comments
                              where created_at >= now() - interval '30 days')
  ));
end $$;

-- 6) Serie quotidienne pour les graphiques (30 j par defaut).
create or replace function public.admin_daily_series(p_days integer default 30)
returns table (
  day date,
  new_profiles bigint,
  new_matches bigint,
  new_messages bigint,
  new_swipes bigint,
  likes bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  return query select
    g.day::date,
    coalesce(pr.cnt, 0),
    coalesce(m.cnt, 0),
    coalesce(msg.cnt, 0),
    coalesce(sw.cnt, 0),
    coalesce(sw.likes, 0)
  from generate_series(
         (current_date - make_interval(days => greatest(coalesce(p_days, 30), 1) - 1))::date,
         current_date::date, interval '1 day'
       ) as g(day)
  left join (
    select created_at::date d, count(*) cnt
    from public.profiles group by 1
  ) pr on pr.d = g.day::date
  left join (
    select created_at::date d, count(*) cnt
    from public.matches group by 1
  ) m on m.d = g.day::date
  left join (
    select created_at::date d, count(*) cnt
    from public.messages group by 1
  ) msg on msg.d = g.day::date
  left join (
    select created_at::date d, count(*) cnt,
           count(*) filter (where direction = 'like') likes
    from public.swipes group by 1
  ) sw on sw.d = g.day::date
  order by g.day;
end $$;

-- 7) File des verifications (paginee, profil joint) : evite le
--    N+1 fait cote client par app/admin/verifications.tsx.
create or replace function public.admin_verifications_queue(
  p_status text default 'pending',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  type text,
  status text,
  documents jsonb,
  declared_value text,
  verified_value text,
  rejection_reason text,
  created_at timestamptz,
  reviewed_at timestamptz,
  first_name text,
  last_name text,
  city text,
  photos text[],
  identity_verified boolean,
  genotype_verified boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  return query
  select v.id, v.user_id, v.type, v.status, v.documents,
         v.declared_value, v.verified_value, v.rejection_reason,
         v.created_at, v.reviewed_at,
         p.first_name, p.last_name, p.city, p.photos,
         p.identity_verified, p.genotype_verified
  from public.verifications v
  left join public.profiles p on p.user_id = v.user_id
  where (p_status is null or v.status = p_status)
  order by (v.status = 'pending') desc, v.created_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end $$;

-- 8) File des signalements (paginee, profil du signalant +
--    du signal + volume total de signalements recus).
create or replace function public.admin_reports_queue(
  p_status text default 'pending',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  reason text,
  details text,
  status text,
  created_at timestamptz,
  reviewed_at timestamptz,
  reporter_name text,
  reported_user_id uuid,
  reported_name text,
  reported_city text,
  reported_photos text[],
  reported_banned_at timestamptz,
  report_count bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  return query
  select r.id, r.reason, r.details, r.status, r.created_at, r.reviewed_at,
         rp.first_name, r.reported_user_id,
         dp.first_name, dp.city, dp.photos, dp.banned_at,
         (select count(*) from public.user_reports x
           where x.reported_user_id = r.reported_user_id)
  from public.user_reports r
  left join public.profiles rp on rp.user_id = r.reporter_id
  left join public.profiles dp on dp.user_id = r.reported_user_id
  where (p_status is null or r.status = p_status)
  order by (r.status = 'pending') desc, r.created_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end $$;

-- 9) Decision sur un signalement (classe / traite), avec audit.
create or replace function public.admin_update_report(
  p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  if p_status not in ('pending', 'reviewed', 'dismissed') then
    raise exception 'statut invalide';
  end if;
  update public.user_reports
     set status = p_status,
         reviewer_id = auth.uid(),
         reviewed_at = now()
   where id = p_id;
  if not found then
    raise exception 'signalement introuvable';
  end if;
end $$;

-- 10) Recherche / listing utilisateurs avec signalements recus et
--     nombre de matchs (fiche profil du panneau).
create or replace function public.admin_users_search(
  p_query text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  city text,
  gender text,
  birth_date text,
  role text,
  photos text[],
  identity_verified boolean,
  genotype_verified boolean,
  banned_at timestamptz,
  banned_reason text,
  report_count bigint,
  match_count bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  return query
  select pr.user_id, pr.first_name, pr.last_name, pr.city, pr.gender,
         pr.birth_date::text, pr.role, pr.photos,
         pr.identity_verified, pr.genotype_verified,
         pr.banned_at, pr.banned_reason,
         (select count(*) from public.user_reports x
           where x.reported_user_id = pr.user_id),
         (select count(*) from public.matches m
           where m.user_id_1 = pr.user_id or m.user_id_2 = pr.user_id)
  from public.profiles pr
  where (
    p_query is null
    or pr.first_name ilike '%' || p_query || '%'
    or pr.last_name  ilike '%' || p_query || '%'
    or pr.city       ilike '%' || p_query || '%'
  )
  order by (pr.banned_at is not null) desc, pr.first_name
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end $$;

-- 11) Journal des pushes : la table est en RLS sans policy (inaccessible
--     aux clients), on la sert ici en lecture admin seule.
create or replace function public.admin_push_log(p_limit integer default 50)
returns table (
  id bigint,
  sent_at timestamptz,
  channel text,
  kind text,
  target_count integer,
  title text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  return query
  select l.id, l.sent_at, l.channel, l.kind, l.target_count, l.title
  from public.push_log l
  order by l.sent_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- 12) Coaching : l admin (web ou mobile) doit pouvoir editer et
--     supprimer un article, et moderer ses commentaires. Policies
--     idempotentes, en plus de celles deja en place.
alter table public.coaching_posts enable row level security;
alter table public.coaching_comments enable row level security;

drop policy if exists coaching_posts_admin_update on public.coaching_posts;
create policy coaching_posts_admin_update on public.coaching_posts for update
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists coaching_posts_admin_delete on public.coaching_posts;
create policy coaching_posts_admin_delete on public.coaching_posts for delete
  using (public.is_admin());

drop policy if exists coaching_comments_admin_delete on public.coaching_comments;
create policy coaching_comments_admin_delete on public.coaching_comments for delete
  using (public.is_admin());

-- 13) Droits : rien pour anon ; execute pour authenticated (chaque
--     fonction verifie interinement is_admin(), y compris les files).
revoke all on function public.admin_set_banned(uuid, boolean, text) from public, anon;
revoke all on function public.admin_stats() from public, anon;
revoke all on function public.admin_daily_series(integer) from public, anon;
revoke all on function public.admin_verifications_queue(text, integer, integer) from public, anon;
revoke all on function public.admin_reports_queue(text, integer, integer) from public, anon;
revoke all on function public.admin_update_report(uuid, text) from public, anon;
revoke all on function public.admin_users_search(text, integer, integer) from public, anon;
revoke all on function public.admin_push_log(integer) from public, anon;
revoke all on function public.profiles_ban_guard() from public, anon, authenticated;

grant execute on function public.admin_set_banned(uuid, boolean, text) to authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_daily_series(integer) to authenticated;
grant execute on function public.admin_verifications_queue(text, integer, integer) to authenticated;
grant execute on function public.admin_reports_queue(text, integer, integer) to authenticated;
grant execute on function public.admin_update_report(uuid, text) to authenticated;
grant execute on function public.admin_users_search(text, integer, integer) to authenticated;
grant execute on function public.admin_push_log(integer) to authenticated;

-- 14) Controles
select proname
from pg_proc
where pronamespace = 'public'::regnamespace
  and (proname like 'admin\_%' or proname = 'profiles_ban_guard')
order by proname;

select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('banned_at', 'banned_reason', 'created_at')
order by column_name;

select tgname from pg_trigger
where tgrelid = 'public.profiles'::regclass and tgname = 'profiles_ban_guard';





