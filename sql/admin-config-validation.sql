create or replace function public.admin_settings_update(p_key text,p_value jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_entry jsonb; v_seen text[]:=array[]::text[];
begin
  if not public.admin_has_permission('settings','manage') then raise exception 'not allowed'; end if;
  if jsonb_typeof(p_value)<>'object' and p_key not in ('moderation_reasons','coaching_categories','onboarding_slides') then raise exception 'setting must be a JSON object'; end if;
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
      or jsonb_typeof(p_value->'matching')<>'object' then raise exception 'options de profil incompletes'; end if;
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
  else raise exception 'réglage inconnu';
  end if;
  update public.admin_app_settings set value=p_value,updated_at=now(),updated_by=auth.uid() where setting_key=p_key;
  if not found then raise exception 'unknown setting'; end if;
  insert into public.admin_audit_log(actor_id,action,target_type,target_id,details)
  values(auth.uid(),'settings.updated','setting',p_key,jsonb_build_object('value',p_value));
end $$;
revoke all on function public.admin_settings_update(text,jsonb) from public,anon;
grant execute on function public.admin_settings_update(text,jsonb) to authenticated;
