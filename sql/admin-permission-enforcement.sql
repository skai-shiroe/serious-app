-- Enforce module permissions for existing privileged RPCs and direct table policies.

-- Enumerations are managed from the dashboard; triggers validate against the active values.
alter table public.user_reports drop constraint if exists user_reports_reason_check;
alter table public.coaching_posts drop constraint if exists coaching_posts_category_check;

create or replace function public.validate_dynamic_label()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_list jsonb; v_allowed boolean;
begin
  if tg_table_name='user_reports' then
    v_list := public.app_public_setting('moderation_reasons');
    select exists(select 1 from jsonb_array_elements(coalesce(v_list,'[]'::jsonb)) x where x->>'value'=new.reason) into v_allowed;
    if not coalesce(v_allowed,false) then raise exception 'invalid report reason'; end if;
  elsif tg_table_name='coaching_posts' then
    v_list := public.app_public_setting('coaching_categories');
    select exists(select 1 from jsonb_array_elements(coalesce(v_list,'[]'::jsonb)) x where x->>'value'=new.category) into v_allowed;
    if not coalesce(v_allowed,false) then raise exception 'invalid coaching category'; end if;
  end if;
  return new;
end $$;
drop trigger if exists validate_report_reason_dynamic on public.user_reports;
create trigger validate_report_reason_dynamic before insert or update of reason on public.user_reports for each row execute function public.validate_dynamic_label();
drop trigger if exists validate_coaching_category_dynamic on public.coaching_posts;
create trigger validate_coaching_category_dynamic before insert or update of category on public.coaching_posts for each row execute function public.validate_dynamic_label();

do $$
declare r record; v_def text;
begin
  for r in select * from (values
    ('admin_stats','dashboard','view'),
    ('admin_daily_series','dashboard','view'),
    ('admin_verifications_queue','verifications','view'),
    ('review_verification','verifications','manage'),
    ('admin_reports_queue','reports','view'),
    ('admin_update_report','reports','manage'),
    ('admin_users_search','users','view'),
    ('admin_set_banned','users','manage'),
    ('admin_push_log','notifications','view')
  ) as x(function_name,module_name,action_name)
  loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=r.function_name
    order by p.oid desc limit 1;
    if v_def is not null then
      v_def := replace(v_def, 'public.is_admin()', format('public.admin_has_permission(%L,%L)',r.module_name,r.action_name));
      execute v_def;
    end if;
  end loop;
end $$;

drop policy if exists countries_admin on public.countries;
create policy countries_admin on public.countries for all to authenticated
  using (public.admin_has_permission('references','manage'))
  with check (public.admin_has_permission('references','manage'));
drop policy if exists cities_admin on public.cities;
create policy cities_admin on public.cities for all to authenticated
  using (public.admin_has_permission('references','manage'))
  with check (public.admin_has_permission('references','manage'));
drop policy if exists interests_admin on public.interests;
create policy interests_admin on public.interests for all to authenticated
  using (public.admin_has_permission('references','manage'))
  with check (public.admin_has_permission('references','manage'));

drop policy if exists coaching_posts_admin_insert on public.coaching_posts;
create policy coaching_posts_admin_insert on public.coaching_posts for insert to authenticated
  with check (public.admin_has_permission('coaching','manage') and user_id=auth.uid());
drop policy if exists coaching_posts_admin_update on public.coaching_posts;
create policy coaching_posts_admin_update on public.coaching_posts for update to authenticated
  using (public.admin_has_permission('coaching','manage'))
  with check (public.admin_has_permission('coaching','manage'));
drop policy if exists coaching_posts_admin_delete on public.coaching_posts;
create policy coaching_posts_admin_delete on public.coaching_posts for delete to authenticated
  using (public.admin_has_permission('coaching','manage'));
drop policy if exists coaching_comments_admin_delete on public.coaching_comments;
create policy coaching_comments_admin_delete on public.coaching_comments for delete to authenticated
  using (public.admin_has_permission('coaching','manage'));

drop policy if exists reports_admin_update on public.user_reports;
create policy reports_admin_update on public.user_reports for update to authenticated
  using (public.admin_has_permission('reports','manage'))
  with check (public.admin_has_permission('reports','manage'));
drop policy if exists reports_select on public.user_reports;
create policy reports_select on public.user_reports for select to authenticated
  using (reporter_id=auth.uid() or public.admin_has_permission('reports','view'));
drop policy if exists verifications_select on public.verifications;
create policy verifications_select on public.verifications for select to authenticated
  using (user_id=auth.uid() or public.admin_has_permission('verifications','view'));

-- Authenticated users can read current app configuration (the settings table remains admin-only).
create or replace function public.app_public_setting(p_key text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select s.value from public.admin_app_settings s
  where s.setting_key=p_key and p_key in ('profile_options','moderation_reasons','coaching_categories','onboarding_slides','legal_content','push_templates','feature_flags','app_defaults');
$$;
revoke all on function public.app_public_setting(text) from public,anon;
grant execute on function public.app_public_setting(text) to anon,authenticated;

-- Add audit entries for review and account moderation (the existing RPCs retain their results).
create or replace function public.admin_set_banned(p_user uuid,p_banned boolean,p_reason text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_role text;
begin
  if not public.admin_has_permission('users','manage') then raise exception 'not allowed'; end if;
  if p_user is null or p_user=auth.uid() then raise exception 'cible invalide'; end if;
  if p_banned and coalesce(trim(p_reason),'')='' then raise exception 'motif de ban obligatoire'; end if;
  select role into v_role from public.profiles where user_id=p_user for update;
  if not found then raise exception 'profil introuvable'; end if;
  if v_role in ('admin','manager') then raise exception 'impossible de bannir un administrateur'; end if;
  update public.profiles set banned_at=case when p_banned then now() else null end,
    banned_reason=case when p_banned then nullif(trim(p_reason),'') else null end
  where user_id=p_user;
  insert into public.admin_audit_log(actor_id,action,target_type,target_id,details)
  values(auth.uid(),case when p_banned then 'user.banned' else 'user.unbanned' end,'user',p_user::text,jsonb_build_object('reason',p_reason));
end $$;

create or replace function public.review_verification(p_id uuid,p_approve boolean,p_verified_value text default null,p_reason text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid; v_type text;
begin
  if not public.admin_has_permission('verifications','manage') then raise exception 'not allowed'; end if;
  update public.verifications
     set status=case when p_approve then 'approved' else 'rejected' end,
         verified_value=p_verified_value,
         rejection_reason=case when p_approve then null else p_reason end,
         reviewer_id=auth.uid(),reviewed_at=now()
   where id=p_id and status='pending'
   returning type,user_id into v_type,v_user;
  if v_user is null then raise exception 'demande introuvable ou deja traitee'; end if;
  if p_approve then
    update public.profiles
       set identity_verified=case when v_type='identity' then true else identity_verified end,
           genotype_verified=case when v_type='genotype' then true else genotype_verified end,
           verified_at=now()
     where user_id=v_user;
  end if;
  insert into public.admin_audit_log(actor_id,action,target_type,target_id,details)
  values(auth.uid(),case when p_approve then 'verification.approved' else 'verification.rejected' end,'verification',p_id::text,jsonb_build_object('user_id',v_user,'type',v_type,'reason',p_reason));
end $$;
revoke all on function public.review_verification(uuid,boolean,text,text) from public,anon;
grant execute on function public.review_verification(uuid,boolean,text,text) to authenticated;

-- Trigger guard runs as the caller so authenticated users cannot alter role directly.
create or replace function public.profiles_role_change_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.role is distinct from old.role
    and current_setting('app.role_change_rpc',true) is distinct from 'true'
    and current_user not in ('postgres','service_role') then
    raise exception 'role changes must use admin_set_user_role';
  end if;
  return new;
end $$;
