-- Validate editable JSON settings before they reach mobile screens and notification triggers.
create or replace function public.admin_settings_update(p_key text,p_value jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_entry jsonb; v_seen text[] := array[]::text[];
begin
  if not public.admin_has_permission('settings','manage') then raise exception 'not allowed'; end if;
  if jsonb_typeof(p_value)<>'object' and p_key not in ('moderation_reasons','coaching_categories','onboarding_slides') then
    raise exception 'setting must be a JSON object';
  end if;
  if p_key in ('moderation_reasons','coaching_categories') then
    if jsonb_typeof(p_value)<>'array' or jsonb_array_length(p_value)<1 then raise exception 'la liste doit contenir au moins une valeur'; end if;
    for v_entry in select value from jsonb_array_elements(p_value) loop
      if nullif(trim(v_entry->>'value'),'') is null or nullif(trim(v_entry->>'label'),'') is null then raise exception 'chaque option doit avoir value et label'; end if;
      if (v_entry->>'value')=any(v_seen) then raise exception 'les valeurs doivent être uniques'; end if;
      v_seen:=array_append(v_seen,v_entry->>'value');
    end loop;
  elsif p_key='profile_options' then
    if jsonb_typeof(p_value->'gender')<>'array' or jsonb_array_length(p_value->'gender')<1
      or jsonb_typeof(p_value->'religion')<>'array' or jsonb_array_length(p_value->'religion')<1
      or jsonb_typeof(p_value->'blood_types')<>'array' or jsonb_array_length(p_value->'blood_types')<1
      or jsonb_typeof(p_value->'genotypes')<>'array' or jsonb_array_length(p_value->'genotypes')<1
      or jsonb_typeof(p_value->'matching')<>'object' then
      raise exception 'options de profil incompletes';
    end if;
    if exists(select 1 from jsonb_array_elements(p_value->'blood_types') x where jsonb_typeof(x.value)<>'string') then raise exception 'les groupes sanguins doivent être du texte'; end if;
    for v_entry in select value from jsonb_array_elements((p_value->'gender')||(p_value->'religion')||(p_value->'genotypes')) loop
      if nullif(trim(v_entry->>'value'),'') is null or nullif(trim(v_entry->>'label'),'') is null then raise exception 'chaque option de profil doit avoir value et label'; end if;
    end loop;
    if jsonb_typeof(p_value->'matching'->'age_min')<>'number' or jsonb_typeof(p_value->'matching'->'age_max')<>'number'
      or (p_value->'matching'->>'age_min')::integer<18 or (p_value->'matching'->>'age_max')::integer>99
      or (p_value->'matching'->>'age_min')::integer >= (p_value->'matching'->>'age_max')::integer then raise exception 'bornes d’âge invalides'; end if;
  elsif p_key='onboarding_slides' then
    if jsonb_typeof(p_value)<>'array' or jsonb_array_length(p_value)<1 or jsonb_array_length(p_value)>8 then raise exception 'il faut entre 1 et 8 écrans'; end if;
    for v_entry in select value from jsonb_array_elements(p_value) loop
      if nullif(trim(v_entry->>'title'),'') is null or nullif(trim(v_entry->>'description'),'') is null then raise exception 'chaque écran exige un titre et un texte'; end if;
    end loop;
  elsif p_key='legal_content' then
    if jsonb_typeof(p_value->'terms')<>'array' or jsonb_typeof(p_value->'privacy')<>'array' then raise exception 'les textes légaux exigent les tableaux terms et privacy'; end if;
    for v_entry in select value from jsonb_array_elements((p_value->'terms')||(p_value->'privacy')) loop
      if nullif(trim(v_entry->>'heading'),'') is null or jsonb_typeof(v_entry->'paragraphs')<>'array' then raise exception 'chaque section légale exige un titre et un tableau de paragraphes'; end if;
    end loop;
  elsif p_key='push_templates' then
    if jsonb_typeof(p_value->'match')<>'object' or jsonb_typeof(p_value->'message')<>'object'
      or jsonb_typeof(p_value->'coaching')<>'object' or jsonb_typeof(p_value->'verification')<>'object' then raise exception 'modèles push incomplets'; end if;
    for v_entry in select value from jsonb_each(p_value) loop
      if v_entry ? 'enabled' and jsonb_typeof(v_entry->'enabled')<>'boolean' then raise exception 'enabled doit être vrai ou faux'; end if;
    end loop;
  elsif p_key='feature_flags' then
    if exists(select 1 from jsonb_each(p_value) x where jsonb_typeof(x.value)<>'boolean') then raise exception 'les indicateurs doivent être des valeurs vrai/faux'; end if;
  elsif p_key='app_defaults' then
    if p_value ? 'maintenance_mode' and jsonb_typeof(p_value->'maintenance_mode')<>'boolean' then raise exception 'maintenance_mode doit être vrai ou faux'; end if;
    if p_value ? 'default_age_min' and ((p_value->>'default_age_min')::integer<18 or (p_value->>'default_age_min')::integer>98) then raise exception 'âge minimum invalide'; end if;
    if p_value ? 'default_age_max' and ((p_value->>'default_age_max')::integer<19 or (p_value->>'default_age_max')::integer>99) then raise exception 'âge maximum invalide'; end if;
  else
    raise exception 'réglage inconnu';
  end if;

  update public.admin_app_settings set value=p_value,updated_at=now(),updated_by=auth.uid() where setting_key=p_key;
  if not found then raise exception 'unknown setting'; end if;
  insert into public.admin_audit_log(actor_id,action,target_type,target_id,details)
  values(auth.uid(),'settings.updated','setting',p_key,jsonb_build_object('value',p_value));
end $$;
revoke all on function public.admin_settings_update(text,jsonb) from public,anon;
grant execute on function public.admin_settings_update(text,jsonb) to authenticated;

-- The global push flag and per-template switch both stop an event before it is sent.
create or replace function public.send_push(
  p_tokens text[],p_title text,p_body text,p_data jsonb default '{}'::jsonb,
  p_channel text default 'system',p_priority text default 'default')
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_clean text[]; v_total integer; v_payload jsonb; v_offset integer:=0; v_chunk integer;
  v_kind text:=p_data->>'type'; v_template jsonb; v_title text:=p_title; v_body text:=p_body;
  v_flags jsonb;
begin
  v_flags:=public.app_public_setting('feature_flags');
  if coalesce((v_flags->>'push_notifications')::boolean,true) is false then return 0; end if;
  v_template:=public.app_public_setting('push_templates')->v_kind;
  if v_template is not null then
    if coalesce((v_template->>'enabled')::boolean,true) is false then return 0; end if;
    if v_kind='verification' then
      v_title:=coalesce(v_template->>'title',p_title);
      v_body:=coalesce(v_template->>(p_data->>'status'),p_body);
    else
      v_title:=coalesce(v_template->>'title',p_title);
      v_body:=coalesce(v_template->>'body',p_body);
    end if;
    v_body:=replace(v_body,'{name}',coalesce(p_data->>'name','quelqu’un'));
    v_body:=replace(v_body,'{title}',coalesce(p_data->>'title',p_body));
    v_body:=replace(v_body,'{body}',p_body);
  end if;
  select coalesce(array_agg(distinct t),array[]::text[]) into v_clean from unnest(coalesce(p_tokens,array[]::text[])) t where t is not null and t<>'';
  v_total:=coalesce(array_length(v_clean,1),0);
  if v_total=0 then return 0; end if;
  while v_offset<v_total loop
    v_chunk:=least(100,v_total-v_offset);
    select coalesce(jsonb_agg(jsonb_build_object('to',tok,'title',v_title,'body',v_body,'sound','default','channelId',p_channel,'priority',p_priority,'data',p_data)),'[]'::jsonb)
    into v_payload from unnest(v_clean[v_offset+1:v_offset+v_chunk]) tok;
    perform net.http_post(url:='https://exp.host/--/api/v2/push/send',headers:='{"Content-Type":"application/json"}'::jsonb,body:=v_payload);
    v_offset:=v_offset+v_chunk;
  end loop;
  insert into public.push_log(channel,kind,target_count,title) values(p_channel,v_kind,v_total,v_title);
  return v_total;
end $$;
revoke execute on function public.send_push(text[],text,text,jsonb,text,text) from anon,authenticated;

-- Audit category/reference edits in addition to the already-audited roles/settings/moderation actions.
create or replace function public.audit_admin_row_change()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_action text; v_target text; v_details jsonb;
begin
  if (tg_table_name='coaching_posts' and not public.admin_has_permission('coaching','manage'))
    or (tg_table_name in ('interests','countries','cities') and not public.admin_has_permission('references','manage')) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  v_action:=case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
  v_target:=coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',to_jsonb(new)->>'code',to_jsonb(old)->>'code',to_jsonb(new)->>'label',to_jsonb(old)->>'label');
  v_details:=jsonb_build_object('table',tg_table_name,'operation',tg_op);
  insert into public.admin_audit_log(actor_id,action,target_type,target_id,details)
  values(auth.uid(),'data.'||tg_table_name||'.'||v_action,tg_table_name,v_target,v_details);
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.audit_admin_row_change() from public,anon,authenticated;

drop trigger if exists audit_coaching_posts_change on public.coaching_posts;
create trigger audit_coaching_posts_change after insert or update or delete on public.coaching_posts for each row execute function public.audit_admin_row_change();
drop trigger if exists audit_interests_change on public.interests;
create trigger audit_interests_change after insert or update or delete on public.interests for each row execute function public.audit_admin_row_change();
drop trigger if exists audit_countries_change on public.countries;
create trigger audit_countries_change after insert or update or delete on public.countries for each row execute function public.audit_admin_row_change();
drop trigger if exists audit_cities_change on public.cities;
create trigger audit_cities_change after insert or update or delete on public.cities for each row execute function public.audit_admin_row_change();

create or replace function public.audit_report_review()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.status is distinct from new.status and public.admin_has_permission('reports','manage') then
    insert into public.admin_audit_log(actor_id,action,target_type,target_id,details)
    values(auth.uid(),'report.status_changed','report',new.id::text,jsonb_build_object('from',old.status,'to',new.status));
  end if;
  return new;
end $$;
revoke all on function public.audit_report_review() from public,anon,authenticated;
drop trigger if exists audit_report_review_change on public.user_reports;
create trigger audit_report_review_change after update of status on public.user_reports for each row execute function public.audit_report_review();
