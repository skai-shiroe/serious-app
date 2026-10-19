-- apply dynamic notification templates centrally without changing the event triggers.
create or replace function public.send_push(
  p_tokens text[],
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_channel text default 'system',
  p_priority text default 'default')
returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_clean text[];
  v_total integer;
  v_payload jsonb;
  v_offset integer := 0;
  v_chunk integer;
  v_kind text := p_data->>'type';
  v_template jsonb;
  v_title text := p_title;
  v_body text := p_body;
begin
  v_template := public.app_public_setting('push_templates')->v_kind;
  if v_template is not null then
    if coalesce((v_template->>'enabled')::boolean,true) is false then return 0; end if;
    if v_kind='verification' then
      v_title := coalesce(v_template->>'title',p_title);
      v_body := coalesce(v_template->>(p_data->>'status'),p_body);
    else
      v_title := coalesce(v_template->>'title',p_title);
      v_body := coalesce(v_template->>'body',p_body);
    end if;
    v_body := replace(v_body,'{name}',coalesce(p_data->>'name','quelqu’un'));
    v_body := replace(v_body,'{title}',coalesce(p_data->>'title',p_body));
    v_body := replace(v_body,'{body}',p_body);
  end if;

  select coalesce(array_agg(distinct t),array[]::text[]) into v_clean
  from unnest(coalesce(p_tokens,array[]::text[])) as t
  where t is not null and t<>'';
  v_total := coalesce(array_length(v_clean,1),0);
  if v_total=0 then return 0; end if;

  while v_offset<v_total loop
    v_chunk := least(100,v_total-v_offset);
    select coalesce(jsonb_agg(jsonb_build_object(
      'to',tok,'title',v_title,'body',v_body,'sound','default',
      'channelId',p_channel,'priority',p_priority,'data',p_data)),'[]'::jsonb)
    into v_payload from unnest(v_clean[v_offset+1:v_offset+v_chunk]) as tok;
    perform net.http_post(
      url:='https://exp.host/--/api/v2/push/send',
      headers:='{"Content-Type":"application/json"}'::jsonb,
      body:=v_payload);
    v_offset:=v_offset+v_chunk;
  end loop;

  insert into public.push_log(channel,kind,target_count,title)
  values(p_channel,v_kind,v_total,v_title);
  return v_total;
end $$;
revoke execute on function public.send_push(text[],text,text,jsonb,text,text) from anon,authenticated;
