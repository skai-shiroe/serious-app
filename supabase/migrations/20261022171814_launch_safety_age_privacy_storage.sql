-- Enforce the product's 18+ rule at the database boundary. The UI check is
-- useful feedback, but direct API writes must be rejected too.
create or replace function private.enforce_adult_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.birth_date is null then
    raise exception using errcode = '23514', message = 'Une date de naissance est obligatoire.';
  end if;

  if new.birth_date > (current_date - interval '18 years')::date then
    raise exception using errcode = '23514', message = 'Geno est réservé aux personnes âgées de 18 ans ou plus.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_adult_profile() from public, anon, authenticated;
drop trigger if exists profiles_enforce_adult on public.profiles;
create trigger profiles_enforce_adult
before insert or update of birth_date on public.profiles
for each row execute function private.enforce_adult_profile();

-- The deck still uses the declared markers to apply the agreed compatibility
-- rules, but does not disclose either marker or verification state before a
-- mutual match. The matched-profile RPC remains the reveal path.
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
    and (p_blood_types is null or pg_catalog.cardinality(p_blood_types) = 0 or p.blood_type = any(p_blood_types))
    and (p_sickle_cells is null or pg_catalog.cardinality(p_sickle_cells) = 0 or p.sickle_cell = any(p_sickle_cells))
    and pg_catalog.date_part('year', pg_catalog.age(p.birth_date::date)) >= coalesce(p_age_min, 0)
    and pg_catalog.date_part('year', pg_catalog.age(p.birth_date::date)) <= coalesce(p_age_max, 200)
  order by p.user_id
  limit greatest(1, least(coalesce(p_limit, 30), 50));
$$;
revoke all on function public.get_candidate_profiles(integer, uuid, text, text, text[], text[], integer, integer) from public, anon;
grant execute on function public.get_candidate_profiles(integer, uuid, text, text, text[], text[], integer, integer) to authenticated;

-- Likes received also reveal a profile before a mutual match. Keep age and
-- ordinary profile details available while withholding sensitive markers.
create or replace function public.get_received_likes(
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid, user_id uuid, gender text, city text, religion text, profession text,
  interests text[], blood_type text, sickle_cell text, bio text, photos text[],
  created_at timestamptz, updated_at timestamptz, first_name text, last_name text,
  identity_verified boolean, genotype_verified boolean, country_code text,
  age integer, liked_at timestamp without time zone
)
language sql stable security definer
set search_path = ''
as $$
  select p.id, p.user_id, p.gender, p.city, p.religion, p.profession,
         p.interests, null::text, null::text, p.bio, p.photos,
         p.created_at, p.updated_at, p.first_name, p.last_name,
         p.identity_verified, false, p.country_code,
         pg_catalog.date_part('year', pg_catalog.age(p.birth_date::date))::integer,
         s.created_at
  from public.swipes s
  join public.profiles p on p.user_id = s.swiper_id
  join public.profiles viewer on viewer.user_id = (select auth.uid())
  where (select auth.uid()) is not null
    and s.swiped_id = (select auth.uid())
    and s.direction = 'like'
    and p.banned_at is null
    and p.birth_date <= (current_date - interval '18 years')::date
    and viewer.birth_date <= (current_date - interval '18 years')::date
    and p.country_code = viewer.country_code
    and (
      viewer.gender is null or p.gender is null
      or (pg_catalog.lower(p.gender) = 'homme' and pg_catalog.lower(viewer.gender) = 'femme')
      or (pg_catalog.lower(p.gender) = 'femme' and pg_catalog.lower(viewer.gender) = 'homme')
      or pg_catalog.lower(p.gender) not in ('homme', 'femme')
    )
    and (pg_catalog.upper(pg_catalog.btrim(p.sickle_cell)) = 'AA'
      or pg_catalog.upper(pg_catalog.btrim(viewer.sickle_cell)) = 'AA')
    and not exists (select 1 from public.swipes response
      where response.swiper_id = (select auth.uid()) and response.swiped_id = p.user_id)
    and not exists (select 1 from public.matches m where
      (m.user_id_1 = (select auth.uid()) and m.user_id_2 = p.user_id)
      or (m.user_id_2 = (select auth.uid()) and m.user_id_1 = p.user_id))
    and not exists (select 1 from public.user_blocks b where
      (b.user_id = (select auth.uid()) and b.blocked_user_id = p.user_id)
      or (b.user_id = p.user_id and b.blocked_user_id = (select auth.uid())))
  order by s.created_at desc, p.user_id
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.get_received_likes(integer, integer) from public, anon;
grant execute on function public.get_received_likes(integer, integer) to authenticated;

create or replace function public.get_received_likes_count()
returns integer
language sql stable security definer
set search_path = ''
as $$
  select pg_catalog.count(*)::integer
  from public.swipes s
  join public.profiles p on p.user_id = s.swiper_id
  join public.profiles viewer on viewer.user_id = (select auth.uid())
  where (select auth.uid()) is not null
    and s.swiped_id = (select auth.uid()) and s.direction = 'like'
    and p.banned_at is null
    and p.birth_date <= (current_date - interval '18 years')::date
    and viewer.birth_date <= (current_date - interval '18 years')::date
    and p.country_code = viewer.country_code
    and (viewer.gender is null or p.gender is null
      or (pg_catalog.lower(p.gender) = 'homme' and pg_catalog.lower(viewer.gender) = 'femme')
      or (pg_catalog.lower(p.gender) = 'femme' and pg_catalog.lower(viewer.gender) = 'homme')
      or pg_catalog.lower(p.gender) not in ('homme', 'femme'))
    and (pg_catalog.upper(pg_catalog.btrim(p.sickle_cell)) = 'AA'
      or pg_catalog.upper(pg_catalog.btrim(viewer.sickle_cell)) = 'AA')
    and not exists (select 1 from public.swipes response
      where response.swiper_id = (select auth.uid()) and response.swiped_id = p.user_id)
    and not exists (select 1 from public.matches m where
      (m.user_id_1 = (select auth.uid()) and m.user_id_2 = p.user_id)
      or (m.user_id_2 = (select auth.uid()) and m.user_id_1 = p.user_id))
    and not exists (select 1 from public.user_blocks b where
      (b.user_id = (select auth.uid()) and b.blocked_user_id = p.user_id)
      or (b.user_id = p.user_id and b.blocked_user_id = (select auth.uid())));
$$;
revoke all on function public.get_received_likes_count() from public, anon;
grant execute on function public.get_received_likes_count() to authenticated;

-- Profile uploads are JPEG-transcoded by the app. Keep a small compatibility
-- allow-list for clients that upload PNG/WebP directly, with a 5 MiB ceiling.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'avatars';

-- The dynamic legal content takes precedence over the app's bundled fallback.
-- Keep its medical-data statement aligned with the actual API boundary.
update public.admin_app_settings
set value = pg_catalog.jsonb_set(
      value,
      '{privacy,2,paragraphs,1}',
      to_jsonb('Vos marqueurs de santé déclarés servent à appliquer les règles de compatibilité aux propositions. Ils ne sont pas renvoyés dans les profils de découverte ou les likes reçus ; ils ne deviennent visibles à l''autre personne qu''après un match réciproque, si vous avez choisi de les renseigner.'::text),
      false
    ),
    updated_at = now()
where setting_key = 'legal_content'
  and value #> '{privacy,2,paragraphs}' is not null;
