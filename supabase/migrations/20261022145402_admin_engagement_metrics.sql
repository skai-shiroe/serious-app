-- Indicateurs d'engagement additionnels pour le dashboard administrateur.
-- Le nombre de likes reçus est présenté comme profils destinataires distincts
-- pour éviter de compter plusieurs fois un même profil.
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.admin_has_permission('dashboard', 'view') then
    raise exception 'not allowed';
  end if;

  return jsonb_build_object(
    'profiles_total', (select count(*) from public.profiles),
    'profiles_7d', (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
    'profiles_30d', (select count(*) from public.profiles where created_at >= now() - interval '30 days'),
    'verified_total', (select count(*) from public.profiles where identity_verified or genotype_verified),
    'banned_total', (select count(*) from public.profiles where banned_at is not null),
    'verifications_pending', (select count(*) from public.verifications where status = 'pending'),
    'verifications_30d', (select count(*) from public.verifications where created_at >= now() - interval '30 days'),
    'reports_pending', (select count(*) from public.user_reports where status = 'pending'),
    'reports_30d', (select count(*) from public.user_reports where created_at >= now() - interval '30 days'),
    'matches_total', (select count(*) from public.matches),
    'matches_7d', (select count(*) from public.matches where created_at >= now() - interval '7 days'),
    'matches_30d', (select count(*) from public.matches where created_at >= now() - interval '30 days'),
    'messages_total', (select count(*) from public.messages),
    'messages_7d', (select count(*) from public.messages where created_at >= now() - interval '7 days'),
    'messages_30d', (select count(*) from public.messages where created_at >= now() - interval '30 days'),
    'swipes_7d', (select count(*) from public.swipes where created_at >= now() - interval '7 days'),
    'likes_7d', (select count(*) from public.swipes where created_at >= now() - interval '7 days' and direction = 'like'),
    'profiles_liked_7d', (
      select count(distinct swiped_id)
      from public.swipes
      where created_at >= now() - interval '7 days' and direction = 'like'
    ),
    'coaching_posts', (select count(*) from public.coaching_posts),
    'coaching_likes_30d', (select count(*) from public.coaching_likes where created_at >= now() - interval '30 days'),
    'coaching_comments_30d', (select count(*) from public.coaching_comments where created_at >= now() - interval '30 days')
  );
end;
$$;
