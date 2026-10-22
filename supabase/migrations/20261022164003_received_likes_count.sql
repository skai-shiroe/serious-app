-- Compteur des likes reçus encore en attente, protégé par l'identité Supabase.
create or replace function public.get_received_likes_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.count(*)::integer
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
      or (pg_catalog.lower(p.gender) = 'homme' and pg_catalog.lower(viewer.gender) = 'femme')
      or (pg_catalog.lower(p.gender) = 'femme' and pg_catalog.lower(viewer.gender) = 'homme')
      or pg_catalog.lower(p.gender) not in ('homme', 'femme')
    )
    and (
      pg_catalog.upper(pg_catalog.btrim(p.sickle_cell)) = 'AA'
      or pg_catalog.upper(pg_catalog.btrim(viewer.sickle_cell)) = 'AA'
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
    );
$$;

revoke all on function public.get_received_likes_count() from public, anon;
grant execute on function public.get_received_likes_count() to authenticated;

-- Les événements de swipe sont filtrés par les politiques RLS dans Realtime.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'swipes'
  ) then
    alter publication supabase_realtime add table public.swipes;
  end if;
end
$$;
