-- Security hardening for private profile fields, matching, blocked chats,
-- and verification storage.

-- Profiles may be read directly only by their owner, an admin, or users who
-- have a legitimate relationship with the profile (match/block/coaching).
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_blocked_with(p_user_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.user_blocks b
    where (b.user_id = (select auth.uid()) and b.blocked_user_id = p_user_id)
       or (b.user_id = p_user_id and b.blocked_user_id = (select auth.uid()))
  );
$$;
revoke all on function private.is_blocked_with(uuid) from public, anon;
grant execute on function private.is_blocked_with(uuid) to authenticated;

drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
drop policy if exists profiles_select_private on public.profiles;
create policy profiles_select_private on public.profiles for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin()
  or public.admin_has_permission('verifications', 'view')
  or public.admin_has_permission('reports', 'view')
  or public.admin_has_permission('coaching', 'view')
  or exists (
    select 1 from public.matches m
    where (m.user_id_1 = (select auth.uid()) and m.user_id_2 = profiles.user_id)
       or (m.user_id_2 = (select auth.uid()) and m.user_id_1 = profiles.user_id)
  )
  or private.is_blocked_with(profiles.user_id)
);

-- Keep the profile table usable for ordinary edits while preventing reads of
-- phone, push token, exact birth date, role and moderation fields.
revoke select on public.profiles from public, anon, authenticated;
grant select (
  id, user_id, gender, city, religion, profession, interests, blood_type,
  sickle_cell, bio, photos, created_at, updated_at, first_name, last_name,
  identity_verified, genotype_verified, verified_at, country_code
) on public.profiles to authenticated;

create or replace function public.get_my_profile()
returns setof public.profiles
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.* from public.profiles p where p.user_id = (select auth.uid())
    and (select auth.uid()) is not null;
$$;
revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

create or replace function public.get_my_role()
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.role from public.profiles p where p.user_id = (select auth.uid())
    and (select auth.uid()) is not null;
$$;
revoke all on function public.get_my_role() from public, anon;
grant execute on function public.get_my_role() to authenticated;

-- Drop legacy overloads whose return type exposed every column via SETOF
-- profiles. Discovery is now a curated, server-filtered response.
drop function if exists public.get_candidate_profiles(integer, uuid, text, text, text, integer, integer, text);
drop function if exists public.get_candidate_profiles(integer, uuid, text, text, text, text, integer, integer);
drop function if exists public.get_candidate_profiles(integer, uuid, text, text, text[], text[], integer, integer);

create function public.get_candidate_profiles(
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
set search_path = public, pg_temp
as $$
  select p.id, p.user_id, p.gender, p.city, p.religion, p.profession,
         p.interests, p.blood_type, p.sickle_cell, p.bio, p.photos,
         p.created_at, p.updated_at, p.first_name, p.last_name,
         p.identity_verified, p.genotype_verified, p.country_code,
         case when p.birth_date is null then null
              else date_part('year', age(p.birth_date::date))::integer end
  from public.profiles p
  join public.profiles viewer on viewer.user_id = (select auth.uid())
  where (select auth.uid()) is not null
    and p.user_id <> (select auth.uid())
    and p.banned_at is null
    and p.country_code = viewer.country_code
    and not exists (select 1 from public.swipes s
                    where s.swiper_id = (select auth.uid()) and s.swiped_id = p.user_id)
    and not exists (select 1 from public.user_blocks b
                    where (b.user_id = (select auth.uid()) and b.blocked_user_id = p.user_id)
                       or (b.user_id = p.user_id and b.blocked_user_id = (select auth.uid())))
    and (p_after is null or p.user_id > p_after)
    and (p_gender is null or lower(p.gender) = lower(p_gender))
    and (p_city is null or p.city ilike '%' || p_city || '%')
    -- Confirmed medical rule: AA sees AA, AS, AC, SS, SC and CC;
    -- every other or unknown viewer genotype sees AA only.
    and p.sickle_cell = any(case when upper(trim(viewer.sickle_cell)) = 'AA'
      then array['AA','AS','AC','SS','SC','CC']::text[] else array['AA']::text[] end)
    and (p_blood_types is null or cardinality(p_blood_types) = 0 or p.blood_type = any(p_blood_types))
    and (p_sickle_cells is null or cardinality(p_sickle_cells) = 0 or p.sickle_cell = any(p_sickle_cells))
    and (p.birth_date is null or (
      date_part('year', age(p.birth_date::date)) >= coalesce(p_age_min, 0)
      and date_part('year', age(p.birth_date::date)) <= coalesce(p_age_max, 200)
    ))
  order by p.user_id
  limit greatest(1, least(coalesce(p_limit, 30), 50));
$$;
revoke all on function public.get_candidate_profiles(integer, uuid, text, text, text[], text[], integer, integer) from public, anon;
grant execute on function public.get_candidate_profiles(integer, uuid, text, text, text[], text[], integer, integer) to authenticated;

create function public.get_matched_profile(p_user_id uuid)
returns table (
  id uuid, user_id uuid, gender text, city text, religion text, profession text,
  interests text[], blood_type text, sickle_cell text, bio text, photos text[],
  created_at timestamptz, updated_at timestamptz, first_name text, last_name text,
  identity_verified boolean, genotype_verified boolean, country_code text, age integer
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.id, p.user_id, p.gender, p.city, p.religion, p.profession,
         p.interests, p.blood_type, p.sickle_cell, p.bio, p.photos,
         p.created_at, p.updated_at, p.first_name, p.last_name,
         p.identity_verified, p.genotype_verified, p.country_code,
         case when p.birth_date is null then null
              else date_part('year', age(p.birth_date::date))::integer end
  from public.profiles p
  where (select auth.uid()) is not null
    and p.user_id = p_user_id
    and exists (select 1 from public.matches m where
      (m.user_id_1 = (select auth.uid()) and m.user_id_2 = p_user_id)
      or (m.user_id_2 = (select auth.uid()) and m.user_id_1 = p_user_id))
    and not exists (select 1 from public.user_blocks b where
      (b.user_id = (select auth.uid()) and b.blocked_user_id = p_user_id)
      or (b.user_id = p_user_id and b.blocked_user_id = (select auth.uid())))
    and p.banned_at is null;
$$;
revoke all on function public.get_matched_profile(uuid) from public, anon;
grant execute on function public.get_matched_profile(uuid) to authenticated;

-- Do not allow clients to fabricate a match. The mutual-like trigger remains
-- the only authenticated path that creates one.
drop policy if exists "Users can insert matches" on public.matches;
revoke insert on public.matches from anon, authenticated;

create or replace function public.check_mutual_match()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.direction = 'like'
     and not exists (
       select 1 from public.user_blocks b
       where (b.user_id = new.swiper_id and b.blocked_user_id = new.swiped_id)
          or (b.user_id = new.swiped_id and b.blocked_user_id = new.swiper_id)
     )
     and exists (
       select 1 from public.swipes s
       where s.swiper_id = new.swiped_id and s.swiped_id = new.swiper_id and s.direction = 'like'
     ) then
    insert into public.matches (user_id_1, user_id_2)
    values (least(new.swiper_id, new.swiped_id), greatest(new.swiper_id, new.swiped_id))
    on conflict do nothing;
  end if;
  return new;
end;
$$;

-- A block stops message reads, inserts, and edits through direct API calls.
drop policy if exists "Users can read messages from their matches" on public.messages;
create policy "Users can read messages from their matches" on public.messages for select to authenticated
using (
  exists (select 1 from public.matches m where m.id = messages.match_id
    and (m.user_id_1 = (select auth.uid()) or m.user_id_2 = (select auth.uid()))
    and not private.is_blocked_with(case when m.user_id_1 = (select auth.uid()) then m.user_id_2 else m.user_id_1 end)
  )
);

drop policy if exists "Users can send messages" on public.messages;
create policy "Users can send messages" on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (select 1 from public.matches m where m.id = messages.match_id
    and (m.user_id_1 = (select auth.uid()) or m.user_id_2 = (select auth.uid()))
    and not private.is_blocked_with(case when m.user_id_1 = (select auth.uid()) then m.user_id_2 else m.user_id_1 end))
  and (reply_to_id is null or public.message_reply_belongs_to_match(reply_to_id, match_id))
);

drop policy if exists messages_update_own on public.messages;
create policy messages_update_own on public.messages for update to authenticated
using (sender_id = (select auth.uid()) and exists (
  select 1 from public.matches m where m.id = messages.match_id
    and (m.user_id_1 = (select auth.uid()) or m.user_id_2 = (select auth.uid()))
    and not private.is_blocked_with(case when m.user_id_1 = (select auth.uid()) then m.user_id_2 else m.user_id_1 end)
))
with check (sender_id = (select auth.uid()) and exists (
  select 1 from public.matches m where m.id = messages.match_id
    and (m.user_id_1 = (select auth.uid()) or m.user_id_2 = (select auth.uid()))
    and not private.is_blocked_with(case when m.user_id_1 = (select auth.uid()) then m.user_id_2 else m.user_id_1 end)
) and (reply_to_id is null or public.message_reply_belongs_to_match(reply_to_id, match_id)));

-- Verification documents are sensitive; accept only image files and cap each
-- upload to 10 MiB. The avatar bucket is intentionally unchanged.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'verifications';
