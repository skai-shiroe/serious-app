-- =============================================================
-- NOTIFICATIONS - BLOC 8 : RELANCES PLANIFIEES (1/2)
-- A coller en DERNIER. Necessite pg_cron :
--   - si "create extension pg_cron" echoue, active pg_cron dans
--     Dashboard > Database > Extensions, puis relance ce bloc ;
--   - pg_cron execute en fuseau de la base (en general UTC).
-- Chaque job est une fonction appelable A LA MAIN pour test :
--     select public.job_match_no_message();
-- =============================================================

create extension if not exists pg_cron;

-- -------------------------------------------------------------
-- 8.1 MATCH SANS MESSAGE : "Dites bonjour" apres 24 h de silence.
--     Relance au plus une fois par match et par 24 h (push_throttle).
--     Necessite matches.created_at (verifie par le diagnostic).
-- -------------------------------------------------------------
create or replace function public.job_match_no_message()
returns integer language plpgsql security definer set search_path = public as $$
declare v record; v_cnt integer := 0;
begin
  for v in
    select m.id,
           m.user_id_1 as u1, m.user_id_2 as u2,
           p1.first_name as n1, p1.push_token as t1,
           p2.first_name as n2, p2.push_token as t2
      from public.matches m
      join public.profiles p1 on p1.user_id = m.user_id_1
      join public.profiles p2 on p2.user_id = m.user_id_2
     where m.created_at < now() - interval '24 hours'
       and not exists (select 1 from public.messages msg where msg.match_id = m.id)
     order by m.created_at
     limit 200
  loop
    if v.t1 is not null and v.t1 <> ''
       and public.push_allowed(v.u1, 'match_reminder', v.id::text, interval '24 hours') then
      perform public.send_push(
        array[v.t1], '💬 Dites bonjour !',
        'Vous avez un match avec ' || coalesce(v.n2, 'quelqu''un') ||
        ' mais aucun message : lancez la discussion !',
        jsonb_build_object('type', 'match'), 'matches', 'default');
      v_cnt := v_cnt + 1;
    end if;

    if v.t2 is not null and v.t2 <> ''
       and public.push_allowed(v.u2, 'match_reminder', v.id::text, interval '24 hours') then
      perform public.send_push(
        array[v.t2], '💬 Dites bonjour !',
        'Vous avez un match avec ' || coalesce(v.n1, 'quelqu''un') ||
        ' mais aucun message : lancez la discussion !',
        jsonb_build_object('type', 'match'), 'matches', 'default');
      v_cnt := v_cnt + 1;
    end if;
  end loop;

  return v_cnt;
end $$;

-- -------------------------------------------------------------
-- 8.2 MESSAGES NON LUS : un recap par jour au maximum.
--     Le corpus est recalcule a chaque execution ; c'est le
--     throttle (20 h) qui evite le spam, pas la fenetre du select.
-- -------------------------------------------------------------
create or replace function public.job_unread_digest()
returns integer language plpgsql security definer set search_path = public as $$
declare v record; v_cnt integer := 0;
begin
  for v in
    select x.uid, count(*) as n, max(p.push_token) as token
      from (
        select m.user_id_1 as uid
          from public.messages msg
          join public.matches m on m.id = msg.match_id
         where msg.read is not true and msg.sender_id <> m.user_id_1
        union all
        select m.user_id_2
          from public.messages msg
          join public.matches m on m.id = msg.match_id
         where msg.read is not true and msg.sender_id <> m.user_id_2
      ) x
      join public.profiles p on p.user_id = x.uid
     where p.push_token is not null and p.push_token <> ''
     group by x.uid
     limit 200
  loop
    if public.push_allowed(v.uid, 'unread_digest', 'daily', interval '20 hours') then
      perform public.send_push(
        array[v.token],
        case when v.n = 1 then '📩 1 message non lu'
             else '📩 ' || v.n || ' messages non lus' end,
        'Ouvrez Messagerie pour y répondre',
        jsonb_build_object('type', 'match'),
        'messages', 'default');
      v_cnt := v_cnt + 1;
    end if;
  end loop;

  return v_cnt;
end $$;

-- SUITE : bloc 8 (2/2) profil incomplet + digest ville + planification
-- -------------------------------------------------------------
-- 8.3 PROFIL INCOMPLET : relance 48 h apres la creation, au plus
--     une fois par 72 h. Necessite profiles.created_at.
-- -------------------------------------------------------------
create or replace function public.job_profile_incomplete()
returns integer language plpgsql security definer set search_path = public as $$
declare v record; v_cnt integer := 0;
begin
  for v in
    select p.user_id, p.push_token
      from public.profiles p
     where p.push_token is not null
       and p.push_token <> ''
       and p.created_at < now() - interval '48 hours'
       and (coalesce(p.bio, '') = ''
            or coalesce(p.city, '') = ''
            or coalesce(p.profession, '') = ''
            or p.birth_date is null)
     limit 200
  loop
    if public.push_allowed(v.user_id, 'profile_incomplete', 'any', interval '72 hours') then
      perform public.send_push(
        array[v.push_token],
        '🧩 Votre profil est incomplet',
        'Ajoutez ville, profession ou bio pour apparaître davantage dans « Découvrir ».',
        jsonb_build_object('type', 'profile_incomplete'),
        'system', 'default');
      v_cnt := v_cnt + 1;
    end if;
  end loop;

  return v_cnt;
end $$;

-- -------------------------------------------------------------
-- 8.4 DIGEST VILLE (hebdo) : "N nouveaux profils a {ville}".
--     1 envoi par ville et par personne/semaine (cle = ville).
--     Bornes : 50 villes par execution, 300 destinataires par ville.
--     Pour un digest QUOTIDIEN : changer l'intervalle a '24 hours'
--     ci-dessous et la cron expression en '0 18 * * *'.
-- -------------------------------------------------------------
create or replace function public.job_city_digest()
returns integer language plpgsql security definer set search_path = public as $$
declare v record; r record; v_cnt integer := 0;
begin
  for v in
    select p.city, count(*) as newcomers
      from public.profiles p
     where p.created_at > now() - interval '7 days'
       and coalesce(p.city, '') <> ''
     group by p.city
     order by count(*) desc
     limit 50
  loop
    for r in
      select t.user_id, t.push_token
        from public.profiles t
       where t.city = v.city
         and t.push_token is not null
         and t.push_token <> ''
       limit 300
    loop
      if public.push_allowed(r.user_id, 'city_digest', v.city, interval '7 days') then
        perform public.send_push(
          array[r.push_token],
          case when v.newcomers = 1
               then '💖 1 nouveau profil à ' || v.city
               else '💖 ' || v.newcomers || ' nouveaux profils à ' || v.city end,
          'Découvrez les nouveaux profils de votre ville cette semaine.',
          jsonb_build_object('type', 'city_digest'),
          'system', 'default');
        v_cnt := v_cnt + 1;
      end if;
    end loop;
  end loop;

  return v_cnt;
end $$;

-- -------------------------------------------------------------
-- PLANIFICATION (idempotent : chaque job est re-planifie proprement)
-- Horaire en UTC (fuseau de la base) :
--   04h  purge du journal | 10h  match silencieux | 11h profil incomplet
--   18h  messages non lus | lundi 18h  digest ville
-- -------------------------------------------------------------
do $$ begin perform cron.unschedule('push-log-purge');      exception when others then null; end $$;
do $$ begin perform cron.unschedule('job-match-no-message');exception when others then null; end $$;
do $$ begin perform cron.unschedule('job-unread-digest');   exception when others then null; end $$;
do $$ begin perform cron.unschedule('job-profile-incomplete'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('job-city-digest');     exception when others then null; end $$;

select cron.schedule('push-log-purge', '0 4 * * *',
  $$delete from public.push_log where sent_at < now() - interval '7 days'$$);
select cron.schedule('job-match-no-message', '0 10 * * *',
  $$select public.job_match_no_message()$$);
select cron.schedule('job-profile-incomplete', '0 11 * * *',
  $$select public.job_profile_incomplete()$$);
select cron.schedule('job-unread-digest', '0 18 * * *',
  $$select public.job_unread_digest()$$);
select cron.schedule('job-city-digest', '0 18 * * 1',
  $$select public.job_city_digest()$$);

-- -------------------------------------------------------------
-- Verification : les 5 jobs doivent apparaitre ci-dessous
-- -------------------------------------------------------------
select jobid, jobname, schedule, database
from cron.job
order by jobname;

