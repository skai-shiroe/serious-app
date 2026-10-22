-- Liste sécurisée des likes reçus encore en attente de réponse.
-- Le profil complet est renvoyé uniquement après un like explicite reçu,
-- en gardant les mêmes règles de pays, genre et compatibilité que le deck.
create or replace function public.get_received_likes(
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  gender text,
  city text,
  religion text,
  profession text,
  interests text[],
  blood_type text,
  sickle_cell text,
  bio text,
  photos text[],
  created_at timestamptz,
  updated_at timestamptz,
  first_name text,
  last_name text,
  identity_verified boolean,
  genotype_verified boolean,
  country_code text,
  age integer,
  liked_at timestamp without time zone
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.user_id,
    p.gender,
    p.city,
    p.religion,
    p.profession,
    p.interests,
    p.blood_type,
    p.sickle_cell,
    p.bio,
    p.photos,
    p.created_at,
    p.updated_at,
    p.first_name,
    p.last_name,
    p.identity_verified,
    p.genotype_verified,
    p.country_code,
    case when p.birth_date is null then null
      else pg_catalog.date_part('year', pg_catalog.age(p.birth_date::date))::integer
    end,
    s.created_at
  from public.swipes s
  join public.profiles p on p.user_id = s.swiper_id
  join public.profiles viewer on viewer.user_id = (select auth.uid())
  where (select auth.uid()) is not null
    and s.swiped_id = (select auth.uid())
    and s.direction = 'like'
    and p.banned_at is null
    and p.country_code = viewer.country_code
    and (
      viewer.gender is null
      or p.gender is null
      or (lower(p.gender) = 'homme' and lower(viewer.gender) = 'femme')
      or (lower(p.gender) = 'femme' and lower(viewer.gender) = 'homme')
      or lower(p.gender) not in ('homme', 'femme')
    )
    and (
      upper(pg_catalog.btrim(p.sickle_cell)) = 'AA'
      or upper(pg_catalog.btrim(viewer.sickle_cell)) = 'AA'
    )
    and not exists (
      select 1 from public.swipes response
      where response.swiper_id = (select auth.uid())
        and response.swiped_id = p.user_id
    )
    and not exists (
      select 1 from public.matches m
      where (m.user_id_1 = (select auth.uid()) and m.user_id_2 = p.user_id)
         or (m.user_id_2 = (select auth.uid()) and m.user_id_1 = p.user_id)
    )
    and not exists (
      select 1 from public.user_blocks b
      where (b.user_id = (select auth.uid()) and b.blocked_user_id = p.user_id)
         or (b.user_id = p.user_id and b.blocked_user_id = (select auth.uid()))
    )
  order by s.created_at desc, p.user_id
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.get_received_likes(integer, integer) from public, anon;
grant execute on function public.get_received_likes(integer, integer) to authenticated;
