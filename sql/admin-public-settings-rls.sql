-- Public app configuration is read-only and restricted to explicitly public keys.
drop policy if exists admin_settings_read on public.admin_app_settings;
create policy admin_settings_read on public.admin_app_settings for select to authenticated
  using (public.admin_has_permission('settings','view'));
drop policy if exists app_public_settings_read on public.admin_app_settings;
create policy app_public_settings_read on public.admin_app_settings for select to anon,authenticated
  using (setting_key in ('profile_options','moderation_reasons','coaching_categories','onboarding_slides','legal_content','push_templates','feature_flags','app_defaults'));
grant select on public.admin_app_settings to anon,authenticated;

create or replace function public.app_public_setting(p_key text)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  select s.value from public.admin_app_settings s
  where s.setting_key=p_key
    and p_key in ('profile_options','moderation_reasons','coaching_categories','onboarding_slides','legal_content','push_templates','feature_flags','app_defaults');
$$;
revoke all on function public.app_public_setting(text) from public;
grant execute on function public.app_public_setting(text) to anon,authenticated;

drop policy if exists admin_role_permissions_read on public.admin_role_permissions;
create policy admin_role_permissions_read on public.admin_role_permissions for select to authenticated
  using (public.admin_has_permission('roles','view'));

revoke all on function public.validate_dynamic_label() from public,anon,authenticated;
revoke all on function public.profiles_role_change_guard() from public,anon,authenticated;
