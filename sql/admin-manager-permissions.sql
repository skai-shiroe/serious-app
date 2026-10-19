create or replace function public.admin_manager_permissions()
returns table(role text,module text,can_view boolean,can_manage boolean)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.admin_has_permission('roles','manage') then raise exception 'not allowed'; end if;
  return query select rp.role,rp.module,rp.can_view,rp.can_manage
  from public.admin_role_permissions rp where rp.role='manager' order by rp.module;
end $$;
revoke all on function public.admin_manager_permissions() from public,anon;
grant execute on function public.admin_manager_permissions() to authenticated;
