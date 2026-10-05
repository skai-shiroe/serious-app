-- =============================================================
-- NOTIFICATIONS - ETAPE 0 : DIAGNOSTIC
-- A coller dans Supabase > SQL Editor AVANT les blocs 6, 7 et 8.
-- Objectif : valider pg_cron, les colonnes exactes, l'etat des tokens.
-- =============================================================

-- 1) Extensions disponibles (pg_net deja actif depuis le bloc 5)
select name, default_version, installed_version
from pg_available_extensions
where name in ('pg_net', 'pg_cron')
order by name;

-- 2) Extensions reellement installees
select extname, extversion
from pg_extension
where extname in ('pg_net', 'pg_cron')
order by 1;

-- 3) Schema exact des 8 tables utilisees par les triggers
--    (verifie en particulier : matches.created_at, profiles.created_at,
--     messages.read, coaching_comments.content, swipes.direction)
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('coaching_posts', 'coaching_comments', 'coaching_likes',
                     'swipes', 'matches', 'messages', 'verifications', 'profiles')
order by table_name, ordinal_position;

-- 4) Etat des tokens push et des roles (les admins recoivent les demandes
--    de verification a traiter)
select count(*) filter (where push_token is not null and push_token <> '') as avec_token,
       count(*) as total_profils
from public.profiles;

select role, count(*)
from public.profiles
group by role
order by 2 desc;

-- =============================================================
-- A VERIFIER MANUELLEMENT (pas du SQL) :
--   Dashboard > Database > Webhooks
--     -> doit-on encore supprimer les 3 webhooks "notify-*" ?
--        (voir l'etape ordre d'application dans le README)
--   Dashboard > Database > Extensions
--     -> pg_cron doit y figurer comme "enabled" avant le bloc 8 ;
--        s'il est absent de pg_available_extensions ci-dessus,
--        active-le ici puis relance le bloc 8.
-- =============================================================
