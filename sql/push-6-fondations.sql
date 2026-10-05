-- =============================================================
-- NOTIFICATIONS - BLOC 6 : FONDATIONS (1/2)
-- A coller apres le diagnostic (sql/push-0-diagnostic.sql).
-- Fournit : send_push (envoi), tokens_for, push_allowed (anti-spam),
-- push_log (debug) et la colonne auteur de coaching_posts.
-- =============================================================

create extension if not exists pg_net;

-- Journal d'envoi : pg_net est asynchrone et muet, ce tableau permet
-- de verifier qu'un envoi a bien ete lance (purge a 7 j, bloc 8).
create table if not exists public.push_log (
  id           bigint generated always as identity primary key,
  sent_at      timestamptz not null default now(),
  channel      text,
  kind         text,
  target_count integer,
  title        text
);

-- Anti-spam : une notification par (utilisateur, type, cle) par intervalle
-- donne. Sert aussi de memoire aux relances (cron du bloc 8).
create table if not exists public.push_throttle (
  user_id uuid not null,
  kind    text not null,
  key     text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, key)
);

-- RLS sans policy = inaccessible aux clients ; seules les fonctions
-- security definer (postgres) y touchent.
alter table public.push_log      enable row level security;
alter table public.push_throttle enable row level security;
revoke all on table public.push_log, public.push_throttle from anon, authenticated;

-- tokens_for : tokens Expo d'une liste d'utilisateurs (vides exclus)
create or replace function public.tokens_for(p_users uuid[])
returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(push_token), array[]::text[])
  from public.profiles
  where push_token is not null
    and push_token <> ''
    and user_id = any (coalesce(p_users, array[]::uuid[]));
$$;

revoke execute on function public.tokens_for(uuid[]) from anon, authenticated;

-- push_allowed : vrai au plus une fois par intervalle
-- (consomme le droit sur l'appel qui reussit)
create or replace function public.push_allowed(
  p_user uuid, p_kind text, p_key text, p_interval interval)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_last timestamptz;
begin
  select sent_at into v_last
  from public.push_throttle
  where user_id = p_user and kind = p_kind and key = p_key;

  if v_last is not null and v_last > now() - p_interval then
    return false;
  end if;

  insert into public.push_throttle (user_id, kind, key, sent_at)
  values (p_user, p_kind, p_key, now())
  on conflict (user_id, kind, key)
  do update set sent_at = excluded.sent_at;

  return true;
end $$;

revoke execute on function public.push_allowed(uuid, text, text, interval) from anon, authenticated;

-- SUITE DU BLOC 6 : send_push + colonne auteur
-- -------------------------------------------------------------
-- send_push : envoi unique vers l'API Expo Push.
--   - gomme les tokens vides/dupliques,
--   - decoupe par paquets de 100 (limite Expo),
--   - no-op total si aucun token,
--   - journalise dans push_log.
-- p_channel  = canal Android (doit exister dans l'app : _layout.tsx)
-- p_priority = 'high' (reveille l'ecran) ou 'default'
-- -------------------------------------------------------------
create or replace function public.send_push(
  p_tokens   text[],
  p_title    text,
  p_body     text,
  p_data     jsonb default '{}'::jsonb,
  p_channel  text  default 'system',
  p_priority text  default 'default')
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_clean   text[];
  v_total   integer;
  v_payload jsonb;
  v_offset  integer := 0;
  v_chunk   integer;
begin
  select coalesce(array_agg(distinct t), array[]::text[])
    into v_clean
    from unnest(coalesce(p_tokens, array[]::text[])) as t
   where t is not null and t <> '';

  v_total := coalesce(array_length(v_clean, 1), 0);
  if v_total = 0 then
    return 0;
  end if;

  while v_offset < v_total loop
    v_chunk := least(100, v_total - v_offset);

    select coalesce(jsonb_agg(jsonb_build_object(
             'to', tok, 'title', p_title, 'body', p_body,
             'sound', 'default', 'channelId', p_channel,
             'priority', p_priority, 'data', p_data)), '[]'::jsonb)
      into v_payload
      from unnest(v_clean[v_offset + 1 : v_offset + v_chunk]) as tok;

    perform net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := v_payload);

    v_offset := v_offset + v_chunk;
  end loop;

  insert into public.push_log (channel, kind, target_count, title)
  values (p_channel, (p_data->>'type'), v_total, p_title);

  return v_total;
end $$;

revoke execute on function public.send_push(text[], text, text, jsonb, text, text)
  from anon, authenticated;

-- -------------------------------------------------------------
-- Auteur des posts de coaching : requis par les notifications
-- "commentaire/like sur mon post" (bloc 7). Les anciens posts
-- restent sans auteur (user_id null) : ils ne notifient personne.
-- -------------------------------------------------------------
alter table public.coaching_posts
  add column if not exists user_id uuid default auth.uid();

create index if not exists coaching_posts_user_id_idx
  on public.coaching_posts (user_id);

comment on column public.coaching_posts.user_id is
  'Auteur du post (admin/manager). Alimente les notifications commentaire et like.';

-- -------------------------------------------------------------
-- Verification
-- -------------------------------------------------------------
do $$
begin
  raise notice 'fonctions send_push/tokens_for: %',
    (select count(*) from pg_proc
      where proname in ('send_push', 'tokens_for', 'push_allowed'));
  raise notice 'coaching_posts.user_id: %',
    (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'coaching_posts'
        and column_name = 'user_id');
end $$;
