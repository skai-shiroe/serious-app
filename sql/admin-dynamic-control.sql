-- Geno: administration dynamique, rôles, permissions et journal.
-- Migration additive, RLS activée sur toutes les tables exposées.

create table if not exists public.admin_app_settings (
  setting_key text primary key,
  label text not null,
  description text not null default '',
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.admin_role_permissions (
  role text not null check (role in ('manager')),
  module text not null check (module in ('dashboard','verifications','reports','users','coaching','references','notifications','settings','roles','audit')),
  can_view boolean not null default false,
  can_manage boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (role, module),
  check (not can_manage or can_view)
);

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

alter table public.admin_app_settings enable row level security;
alter table public.admin_role_permissions enable row level security;
alter table public.admin_audit_log enable row level security;

create or replace function public.admin_has_permission(p_module text, p_action text default 'view')
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select case
      when p.role = 'admin' then true
      when p.role <> 'manager' then false
      when p_action = 'manage' then coalesce(rp.can_manage, false)
      else coalesce(rp.can_view, false)
    end
    from public.profiles p
    left join public.admin_role_permissions rp on rp.role = p.role and rp.module = p_module
    where p.user_id = auth.uid()
    limit 1
  ), false);
$$;
revoke all on function public.admin_has_permission(text, text) from public, anon;
grant execute on function public.admin_has_permission(text, text) to authenticated;

drop policy if exists admin_settings_read on public.admin_app_settings;
create policy admin_settings_read on public.admin_app_settings for select to authenticated using (public.is_admin());
drop policy if exists admin_settings_write on public.admin_app_settings;
create policy admin_settings_write on public.admin_app_settings for all to authenticated
  using (public.admin_has_permission('settings','manage'))
  with check (public.admin_has_permission('settings','manage'));
drop policy if exists admin_role_permissions_read on public.admin_role_permissions;
create policy admin_role_permissions_read on public.admin_role_permissions for select to authenticated using (public.is_admin());
drop policy if exists admin_role_permissions_write on public.admin_role_permissions;
create policy admin_role_permissions_write on public.admin_role_permissions for all to authenticated
  using (public.admin_has_permission('roles','manage'))
  with check (public.admin_has_permission('roles','manage'));
drop policy if exists admin_audit_read on public.admin_audit_log;
create policy admin_audit_read on public.admin_audit_log for select to authenticated using (public.admin_has_permission('audit','view'));
grant select, insert, update, delete on public.admin_app_settings, public.admin_role_permissions to authenticated;
grant select on public.admin_audit_log to authenticated;
grant usage, select on sequence public.admin_audit_log_id_seq to authenticated;

insert into public.admin_role_permissions(role,module,can_view,can_manage) values
  ('manager','dashboard',true,false),('manager','verifications',true,true),
  ('manager','reports',true,true),('manager','users',true,true),
  ('manager','coaching',true,true),('manager','references',true,true),
  ('manager','notifications',true,false),('manager','settings',false,false),
  ('manager','roles',false,false),('manager','audit',true,false)
on conflict (role,module) do nothing;

insert into public.admin_app_settings(setting_key,label,description,value) values
('profile_options','Options de profil','Valeurs affichées lors de la création et modification du profil.',
 '{"gender":[{"value":"homme","label":"Homme"},{"value":"femme","label":"Femme"}],"religion":[{"value":"christianisme","label":"Christianisme"},{"value":"islam","label":"Islam"},{"value":"judaisme","label":"Judaïsme"},{"value":"bouddhisme","label":"Bouddhisme"},{"value":"hindouisme","label":"Hindouisme"},{"value":"autre","label":"Autre"},{"value":"aucune","label":"Aucune"}],"blood_types":["A+","A-","B+","B-","AB+","AB-","O+","O-"],"genotypes":[{"value":"AA","label":"AA (Aucun trait)"},{"value":"AS","label":"AS (Porteur sain)"},{"value":"AC","label":"AC (Porteur du gène C)"},{"value":"SS","label":"SS (Drépanocytaire)"},{"value":"SC","label":"SC (Forme combinée S/C)"},{"value":"CC","label":"CC (Hb C homozygote)"},{"value":"inconnu","label":"Je ne sais pas"}],"matching":{"age_min":18,"age_max":99}}'::jsonb),
('moderation_reasons','Motifs de signalement','Valeurs proposées dans l’application.',
 '[{"value":"fake","label":"Faux profil / usurpation"},{"value":"harassment","label":"Harcèlement / menaces"},{"value":"inappropriate","label":"Contenu inapproprié"},{"value":"spam","label":"Spam / arnaque"},{"value":"other","label":"Autre motif"}]'::jsonb),
('coaching_categories','Catégories coaching','Catégories utilisées pour publier et filtrer les articles.',
 '[{"value":"couple","label":"Couple"},{"value":"santé","label":"Santé"},{"value":"astuce","label":"Astuce"}]'::jsonb),
('onboarding_slides','Écrans d’introduction','Textes des écrans de bienvenue. Les images peuvent être des URL publiques.',
 '[{"title":"Rencontre Sérieuse","description":"Trouve un partenaire compatible qui partage tes valeurs et tes aspirations pour une relation authentique et durable.","image_url":"local:rire_small.jpg"},{"title":"Compatibilité Médicale","description":"Prends des décisions informées grâce à notre système de compatibilité basé sur le groupe sanguin et le statut drépanocytaire.","image_url":"local:brxwn.jpeg"},{"title":"Confidentialité Totale","description":"Tes données médicales et personnelles sont protégées avec les plus hauts standards de sécurité et de confidentialité.","image_url":"local:happy.jpeg"}]'::jsonb),
('legal_content','Textes légaux','Conditions d’utilisation et politique de confidentialité, structurées en sections.',
 '{"terms":[],"privacy":[]}'::jsonb),
('push_templates','Modèles de notifications','Textes et options des notifications générées par l’application.',
 '{"match":{"title":"🎉 Nouveau Match !","body":"Vous avez un nouveau match avec {name} !","enabled":true},"message":{"title":"✉️ Nouveau message","body":"{name} vous a envoyé un message","enabled":true},"coaching":{"title":"💡 Nouveau conseil de coaching","body":"{title}","enabled":true},"verification":{"approved":"Votre vérification a été validée","rejected":"Votre vérification a été refusée","enabled":true},"swipe_like":{"title":"❤️ Quelqu’un vous a liké","body":"Retournez dans Découvrir pour voir qui s’intéresse à vous","enabled":true},"admin_verification":{"title":"Nouvelle demande de vérification","body":"Une demande attend votre examen dans le dashboard","enabled":true}}'::jsonb),
('feature_flags','Fonctionnalités','Activation des modules facultatifs de l’application.',
 '{"coaching":true,"medical_compatibility":true,"push_notifications":true,"profile_verification":true}'::jsonb),
('app_defaults','Réglages par défaut','Réglages généraux de l’expérience Geno.',
 '{"default_match_radius_km":100,"default_age_min":18,"default_age_max":99,"maintenance_mode":false}'::jsonb)
on conflict (setting_key) do nothing;

create or replace function public.admin_get_access()
returns table(role text, module text, can_view boolean, can_manage boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_role text;
begin
  select p.role into v_role from public.profiles p where p.user_id = auth.uid();
  if v_role not in ('admin','manager') then raise exception 'not allowed'; end if;
  if v_role = 'admin' then
    return query select v_role, m.module, true, true from (values
      ('dashboard'),('verifications'),('reports'),('users'),('coaching'),('references'),('notifications'),('settings'),('roles'),('audit')
    ) as m(module);
  else
    return query select rp.role, rp.module, rp.can_view, rp.can_manage from public.admin_role_permissions rp where rp.role = v_role;
  end if;
end $$;

create or replace function public.admin_settings_update(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.admin_has_permission('settings','manage') then raise exception 'not allowed'; end if;
  update public.admin_app_settings set value=p_value, updated_at=now(), updated_by=auth.uid() where setting_key=p_key;
  if not found then raise exception 'unknown setting'; end if;
  insert into public.admin_audit_log(actor_id,action,target_type,target_id,details)
  values(auth.uid(),'settings.updated','setting',p_key,jsonb_build_object('value',p_value));
end $$;

create or replace function public.admin_set_manager_permission(p_module text,p_can_view boolean,p_can_manage boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.admin_has_permission('roles','manage') then raise exception 'not allowed'; end if;
  if p_module in ('roles','settings') then raise exception 'reserved module'; end if;
  insert into public.admin_role_permissions(role,module,can_view,can_manage,updated_at,updated_by)
  values('manager',p_module,p_can_view,p_can_manage,now(),auth.uid())
  on conflict(role,module) do update set can_view=excluded.can_view,can_manage=excluded.can_manage,updated_at=now(),updated_by=auth.uid();
  insert into public.admin_audit_log(actor_id,action,target_type,target_id,details)
  values(auth.uid(),'role_permission.updated','manager',p_module,jsonb_build_object('can_view',p_can_view,'can_manage',p_can_manage));
end $$;

create or replace function public.admin_set_user_role(p_user_id uuid,p_role text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old text; v_count bigint;
begin
  if not public.admin_has_permission('roles','manage') then raise exception 'not allowed'; end if;
  if p_role not in ('user','manager','admin') then raise exception 'invalid role'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot change your own role'; end if;
  perform pg_advisory_xact_lock(hashtext('geno-role-change'));
  select role into v_old from public.profiles where user_id=p_user_id for update;
  if not found then raise exception 'user not found'; end if;
  if v_old='admin' and p_role <> 'admin' then
    select count(*) into v_count from public.profiles where role='admin';
    if v_count <= 1 then raise exception 'cannot remove the last administrator'; end if;
  end if;
  perform set_config('app.role_change_rpc','true',true);
  update public.profiles set role=p_role where user_id=p_user_id;
  insert into public.admin_audit_log(actor_id,action,target_type,target_id,details)
  values(auth.uid(),'user.role_changed','user',p_user_id::text,jsonb_build_object('from',v_old,'to',p_role));
end $$;

create or replace function public.admin_users_roles(p_query text default null,p_limit integer default 50,p_offset integer default 0)
returns table(user_id uuid,email text,first_name text,last_name text,role text,created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth, pg_temp as $$
begin
  if not public.admin_has_permission('roles','view') then raise exception 'not allowed'; end if;
  return query select p.user_id,u.email,p.first_name,p.last_name,p.role,p.created_at
  from public.profiles p join auth.users u on u.id=p.user_id
  where p_query is null or u.email ilike '%'||p_query||'%' or p.first_name ilike '%'||p_query||'%' or p.last_name ilike '%'||p_query||'%'
  order by case p.role when 'admin' then 0 when 'manager' then 1 else 2 end,p.created_at desc
  limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0);
end $$;

create or replace function public.admin_audit_recent(p_limit integer default 100)
returns setof public.admin_audit_log language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.admin_has_permission('audit','view') then raise exception 'not allowed'; end if;
  return query select * from public.admin_audit_log order by created_at desc limit least(greatest(coalesce(p_limit,100),1),500);
end $$;

create or replace function public.profiles_role_change_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.role is distinct from old.role
    and current_setting('app.role_change_rpc',true) is distinct from 'true'
    and current_user not in ('postgres','service_role') then
    raise exception 'role changes must use admin_set_user_role';
  end if;
  return new;
end $$;
drop trigger if exists profiles_role_change_guard on public.profiles;
create trigger profiles_role_change_guard before update of role on public.profiles
for each row execute function public.profiles_role_change_guard();

revoke all on function public.admin_get_access() from public,anon;
revoke all on function public.admin_settings_update(text,jsonb) from public,anon;
revoke all on function public.admin_set_manager_permission(text,boolean,boolean) from public,anon;
revoke all on function public.admin_set_user_role(uuid,text) from public,anon;
revoke all on function public.admin_users_roles(text,integer,integer) from public,anon;
revoke all on function public.admin_audit_recent(integer) from public,anon;
grant execute on function public.admin_get_access() to authenticated;
grant execute on function public.admin_settings_update(text,jsonb) to authenticated;
grant execute on function public.admin_set_manager_permission(text,boolean,boolean) to authenticated;
grant execute on function public.admin_set_user_role(uuid,text) to authenticated;
grant execute on function public.admin_users_roles(text,integer,integer) to authenticated;
grant execute on function public.admin_audit_recent(integer) to authenticated;
