-- Users may edit personal profile fields, but role, verification and ban state
-- are controlled only by trusted server-side admin functions.
revoke insert, update on public.profiles from public, anon, authenticated;

grant insert (
  user_id, gender, city, religion, profession, interests, blood_type,
  sickle_cell, bio, photos, first_name, last_name, birth_date, country_code,
  phone_e164, push_token
) on public.profiles to authenticated;

grant update (
  user_id, gender, city, religion, profession, interests, blood_type,
  sickle_cell, bio, photos, first_name, last_name, birth_date, country_code,
  phone_e164, push_token
) on public.profiles to authenticated;

drop policy if exists "Les utilisateurs peuvent créer leur propre profil" on public.profiles;
create policy "Les utilisateurs peuvent créer leur propre profil" on public.profiles
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and coalesce(role, 'user') = 'user'
  and banned_at is null
  and banned_reason is null
  and not coalesce(identity_verified, false)
  and not coalesce(genotype_verified, false)
  and verified_at is null
);
