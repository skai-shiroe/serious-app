-- Retain the existing RPC signature for old app builds, but ignore the two
-- caller-controlled medical filters. Otherwise an API client could probe a
-- profile's health markers by observing whether it appears in the results.
create or replace function public.get_candidate_profiles(
  p_limit integer default 30,
  p_after uuid default null,
  p_gender text default null,
  p_city text default null,
  p_blood_types text[] default null,
  p_sickle_cells text[] default null,
  p_age_min integer default null,
  p_age_max integer default null
)
returns table (
  id uuid, user_id uuid, gender text, city text, religion text, profession text,
  interests text[], blood_type text, sickle_cell text, bio text, photos text[],
  created_at timestamptz, updated_at timestamptz, first_name text, last_name text,
  identity_verified boolean, genotype_verified boolean, country_code text, age integer
)
language sql stable security definer
set search_path = ''
as $$
  select p.id, p.user_id, p.gender, p.city, p.religion, p.profession,
         p.interests, null::text, null::text, p.bio, p.photos,
         p.created_at, p.updated_at, p.first_name, p.last_name,
         p.identity_verified, false, p.country_code,
         pg_catalog.date_part('year', pg_catalog.age(p.birth_date::date))::integer
  from public.profiles p
  join public.profiles viewer on viewer.user_id = (select auth.uid())
  where (select auth.uid()) is not null
    and p.user_id <> (select auth.uid())
    and p.banned_at is null
    and p.birth_date <= (current_date - interval '18 years')::date
    and viewer.birth_date <= (current_date - interval '18 years')::date
    and p.country_code = viewer.country_code
    and not exists (select 1 from public.swipes s
                    where s.swiper_id = (select auth.uid()) and s.swiped_id = p.user_id)
    and not exists (select 1 from public.user_blocks b
                    where (b.user_id = (select auth.uid()) and b.blocked_user_id = p.user_id)
                       or (b.user_id = p.user_id and b.blocked_user_id = (select auth.uid())))
    and (p_after is null or p.user_id > p_after)
    and (p_gender is null or pg_catalog.lower(p.gender) = pg_catalog.lower(p_gender))
    and (p_city is null or p.city ilike '%' || p_city || '%')
    and p.sickle_cell = any(case when pg_catalog.upper(pg_catalog.btrim(viewer.sickle_cell)) = 'AA'
      then array['AA','AS','AC','SS','SC','CC']::text[] else array['AA']::text[] end)
    and pg_catalog.date_part('year', pg_catalog.age(p.birth_date::date)) >= coalesce(p_age_min, 0)
    and pg_catalog.date_part('year', pg_catalog.age(p.birth_date::date)) <= coalesce(p_age_max, 200)
  order by p.user_id
  limit greatest(1, least(coalesce(p_limit, 30), 50));
$$;
revoke all on function public.get_candidate_profiles(integer, uuid, text, text, text[], text[], integer, integer) from public, anon;
grant execute on function public.get_candidate_profiles(integer, uuid, text, text, text[], text[], integer, integer) to authenticated;
