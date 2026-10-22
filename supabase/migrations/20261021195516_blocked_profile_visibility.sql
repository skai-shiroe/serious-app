-- Expose only the caller's own blocked-user list and enforce bilateral
-- profile invisibility consistently, including incoming blocks.
revoke insert on public.matches from public;

create or replace function public.get_my_blocked_user_ids()
returns table (user_id uuid)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select case when b.user_id = (select auth.uid()) then b.blocked_user_id else b.user_id end
  from public.user_blocks b
  where (select auth.uid()) is not null
    and (b.user_id = (select auth.uid()) or b.blocked_user_id = (select auth.uid()));
$$;
revoke all on function public.get_my_blocked_user_ids() from public, anon;
grant execute on function public.get_my_blocked_user_ids() to authenticated;

create or replace function public.get_my_blocked_profiles()
returns table (user_id uuid, first_name text, photos text[])
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.user_id, p.first_name, p.photos
  from public.user_blocks b
  join public.profiles p on p.user_id = b.blocked_user_id
  where (select auth.uid()) is not null and b.user_id = (select auth.uid());
$$;
revoke all on function public.get_my_blocked_profiles() from public, anon;
grant execute on function public.get_my_blocked_profiles() to authenticated;

drop policy if exists profiles_select_private on public.profiles;
create policy profiles_select_private on public.profiles for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin()
  or public.admin_has_permission('verifications', 'view')
  or public.admin_has_permission('reports', 'view')
  or public.admin_has_permission('coaching', 'view')
  or (
    exists (select 1 from public.matches m where
      (m.user_id_1 = (select auth.uid()) and m.user_id_2 = profiles.user_id)
      or (m.user_id_2 = (select auth.uid()) and m.user_id_1 = profiles.user_id))
    and not private.is_blocked_with(profiles.user_id)
  )
);
