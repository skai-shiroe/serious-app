-- Télémétrie minimale de la page Likes reçus : aucun identifiant de profil consulté.
create table public.feature_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null check (feature = 'received_likes'),
  action text not null check (action in (
    'page_opened', 'profile_opened', 'response_like', 'response_pass'
  )),
  created_at timestamptz not null default now()
);

create index feature_usage_events_feature_created_at_idx
  on public.feature_usage_events (feature, created_at);

alter table public.feature_usage_events enable row level security;
revoke all on public.feature_usage_events from public, anon, authenticated;
grant insert (user_id, feature, action) on public.feature_usage_events to authenticated;

create policy feature_usage_events_insert_own
  on public.feature_usage_events for insert to authenticated
  with check ((select auth.uid()) = user_id);

create or replace function public.force_feature_usage_event_timestamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := pg_catalog.now();
  return new;
end;
$$;
revoke all on function public.force_feature_usage_event_timestamp() from public, anon, authenticated;

create trigger force_feature_usage_event_timestamp
  before insert on public.feature_usage_events
  for each row execute function public.force_feature_usage_event_timestamp();

-- Étend les statistiques filtrées par période avec l'utilisation de Likes reçus.
create or replace function public.admin_activity_data(
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_summary jsonb;
  v_series jsonb;
begin
  if not public.admin_has_permission('dashboard', 'view') then
    raise exception 'not allowed';
  end if;
  if p_start_date is null or p_end_date is null
    or p_start_date > p_end_date
    or p_end_date > current_date then
    raise exception 'invalid date range';
  end if;

  select jsonb_build_object(
    'new_profiles', (select count(*) from public.profiles
      where created_at >= p_start_date::timestamp and created_at < (p_end_date + 1)::timestamp),
    'new_matches', (select count(*) from public.matches
      where created_at >= p_start_date::timestamp and created_at < (p_end_date + 1)::timestamp),
    'new_messages', (select count(*) from public.messages
      where created_at >= p_start_date::timestamp and created_at < (p_end_date + 1)::timestamp),
    'new_swipes', (select count(*) from public.swipes
      where created_at >= p_start_date::timestamp and created_at < (p_end_date + 1)::timestamp),
    'likes', (select count(*) from public.swipes
      where created_at >= p_start_date::timestamp and created_at < (p_end_date + 1)::timestamp
        and direction = 'like'),
    'profiles_liked', (select count(distinct swiped_id) from public.swipes
      where created_at >= p_start_date::timestamp and created_at < (p_end_date + 1)::timestamp
        and direction = 'like'),
    'received_likes_page_opens', (select count(*) from public.feature_usage_events
      where feature = 'received_likes' and action = 'page_opened'
        and created_at >= p_start_date::timestamptz and created_at < (p_end_date + 1)::timestamptz),
    'received_likes_unique_users', (select count(distinct user_id) from public.feature_usage_events
      where feature = 'received_likes' and action = 'page_opened'
        and created_at >= p_start_date::timestamptz and created_at < (p_end_date + 1)::timestamptz),
    'received_like_profiles_opened', (select count(*) from public.feature_usage_events
      where feature = 'received_likes' and action = 'profile_opened'
        and created_at >= p_start_date::timestamptz and created_at < (p_end_date + 1)::timestamptz),
    'received_like_responses', (select count(*) from public.feature_usage_events
      where feature = 'received_likes' and action in ('response_like', 'response_pass')
        and created_at >= p_start_date::timestamptz and created_at < (p_end_date + 1)::timestamptz),
    'received_like_response_likes', (select count(*) from public.feature_usage_events
      where feature = 'received_likes' and action = 'response_like'
        and created_at >= p_start_date::timestamptz and created_at < (p_end_date + 1)::timestamptz),
    'received_like_response_passes', (select count(*) from public.feature_usage_events
      where feature = 'received_likes' and action = 'response_pass'
        and created_at >= p_start_date::timestamptz and created_at < (p_end_date + 1)::timestamptz)
  ) into v_summary;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'day', d.day,
      'new_profiles', coalesce(pr.total, 0),
      'new_matches', coalesce(m.total, 0),
      'new_messages', coalesce(msg.total, 0),
      'new_swipes', coalesce(sw.total, 0),
      'likes', coalesce(sw.likes, 0),
      'profiles_liked', coalesce(sw.profiles_liked, 0),
      'received_likes_page_opens', coalesce(feature_usage_daily.page_opens, 0),
      'received_likes_users', coalesce(feature_usage_daily.unique_users, 0),
      'received_like_profiles_opened', coalesce(feature_usage_daily.profiles_opened, 0),
      'received_like_responses', coalesce(feature_usage_daily.responses, 0),
      'received_like_response_likes', coalesce(feature_usage_daily.response_likes, 0),
      'received_like_response_passes', coalesce(feature_usage_daily.response_passes, 0)
    ) order by d.day
  ), '[]'::jsonb)
  into v_series
  from generate_series(p_start_date, p_end_date, interval '1 day') as d(day)
  left join (
    select created_at::date as day, count(*) as total
    from public.profiles
    where created_at >= p_start_date::timestamp and created_at < (p_end_date + 1)::timestamp
    group by 1
  ) pr on pr.day = d.day::date
  left join (
    select created_at::date as day, count(*) as total
    from public.matches
    where created_at >= p_start_date::timestamp and created_at < (p_end_date + 1)::timestamp
    group by 1
  ) m on m.day = d.day::date
  left join (
    select created_at::date as day, count(*) as total
    from public.messages
    where created_at >= p_start_date::timestamp and created_at < (p_end_date + 1)::timestamp
    group by 1
  ) msg on msg.day = d.day::date
  left join (
    select created_at::date as day,
      count(*) as total,
      count(*) filter (where direction = 'like') as likes,
      count(distinct swiped_id) filter (where direction = 'like') as profiles_liked
    from public.swipes
    where created_at >= p_start_date::timestamp and created_at < (p_end_date + 1)::timestamp
    group by 1
  ) sw on sw.day = d.day::date
  left join (
    select created_at::date as day,
      count(*) filter (where action = 'page_opened') as page_opens,
      count(distinct user_id) filter (where action = 'page_opened') as unique_users,
      count(*) filter (where action = 'profile_opened') as profiles_opened,
      count(*) filter (where action in ('response_like', 'response_pass')) as responses,
      count(*) filter (where action = 'response_like') as response_likes,
      count(*) filter (where action = 'response_pass') as response_passes
    from public.feature_usage_events
    where feature = 'received_likes'
      and created_at >= p_start_date::timestamptz and created_at < (p_end_date + 1)::timestamptz
    group by 1
  ) feature_usage_daily on feature_usage_daily.day = d.day::date;

  return jsonb_build_object('summary', v_summary, 'series', v_series);
end;
$$;
