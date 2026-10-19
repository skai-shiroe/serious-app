-- Durcissement des RPC SECURITY DEFINER signale par Supabase Advisors.
-- A executer apres les blocs admin, verification et notifications.
-- Les fonctions admin restent appelables par authenticated et verifient
-- chacune is_admin(). Les fonctions internes ne sont pas des RPC publiques.

-- search_path de confiance, avec pg_temp explicitement place en dernier.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.prosecdef or p.proconfig is null)
  loop
    execute format(
      'alter function %s set search_path to public, pg_temp',
      f.signature
    );
  end loop;
end $$;

-- Ces politiques ne servent qu'aux comptes connectes. Les limiter permet
-- ensuite de retirer EXECUTE sur is_admin() a anon/PUBLIC.
alter policy coaching_comments_admin_delete on public.coaching_comments to authenticated;
alter policy coaching_posts_admin_delete on public.coaching_posts to authenticated;
alter policy coaching_posts_admin_update on public.coaching_posts to authenticated;
alter policy reports_admin_update on public.user_reports to authenticated;
alter policy reports_select on public.user_reports to authenticated;
alter policy verifications_select on public.verifications to authenticated;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- RPC utilisateur : authentification requise. review_verification verifie
-- ensuite le role admin dans son corps.
revoke execute on function public.mark_verifications_seen() from public, anon;
grant execute on function public.mark_verifications_seen() to authenticated;
revoke execute on function public.review_verification(uuid, boolean, text, text) from public, anon;
grant execute on function public.review_verification(uuid, boolean, text, text) to authenticated;

-- Fonctions internes seulement : triggers, cron et appels entre fonctions
-- SECURITY DEFINER. Aucune ne doit etre exposée en RPC aux roles API.
revoke execute on function public.check_mutual_match() from public, anon, authenticated;
revoke execute on function public.notify_new_match() from public, anon, authenticated;
revoke execute on function public.notify_new_message() from public, anon, authenticated;
revoke execute on function public.notify_new_coaching_post() from public, anon, authenticated;
revoke execute on function public.notify_verification_status() from public, anon, authenticated;
revoke execute on function public.notify_verification_submitted() from public, anon, authenticated;
revoke execute on function public.notify_coaching_comment() from public, anon, authenticated;
revoke execute on function public.notify_coaching_like() from public, anon, authenticated;
revoke execute on function public.notify_swipe_like() from public, anon, authenticated;
revoke execute on function public.job_match_no_message() from public, anon, authenticated;
revoke execute on function public.job_unread_digest() from public, anon, authenticated;
revoke execute on function public.job_profile_incomplete() from public, anon, authenticated;
revoke execute on function public.job_city_digest() from public, anon, authenticated;
revoke execute on function public.tokens_for(uuid[]) from public, anon, authenticated;
revoke execute on function public.push_allowed(uuid, text, text, interval) from public, anon, authenticated;
revoke execute on function public.send_push(text[], text, text, jsonb, text, text) from public, anon, authenticated;

-- Controle post-migration : fonctions internes a zero role API ; RPC utiles
-- reservees a authenticated ; search_path present pour les fonctions ciblees.
select p.oid::regprocedure as function,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
       p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.prosecdef or p.proconfig is null)
order by 1;
