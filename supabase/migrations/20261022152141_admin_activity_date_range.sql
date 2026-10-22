-- Données quotidiennes et totaux pour une période choisie dans le dashboard.
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
        and direction = 'like')
  ) into v_summary;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'day', d.day,
      'new_profiles', coalesce(pr.total, 0),
      'new_matches', coalesce(m.total, 0),
      'new_messages', coalesce(msg.total, 0),
      'new_swipes', coalesce(sw.total, 0),
      'likes', coalesce(sw.likes, 0),
      'profiles_liked', coalesce(sw.profiles_liked, 0)
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
  ) sw on sw.day = d.day::date;

  return jsonb_build_object('summary', v_summary, 'series', v_series);
end;
$$;

revoke all on function public.admin_activity_data(date, date) from public, anon;
grant execute on function public.admin_activity_data(date, date) to authenticated;
