-- ══════════════════════════════════════════════════════════════════════
-- BLOC 12 — Filtres deck MULTI-SÉLECTION (groupe sanguin + génotype)
-- Objectif : passer de la sélection UNIQUETE (`p_blood_type text`, comparaison
-- `=`) à une liste (`text[]` + `= ANY()`), pour cocher plusieurs groupes ou
-- plusieurs génotypes dans l'écran Filtres.
--
-- BREAKING (signé) :
--   • drop de l'ancienne signature `(... text, text, ...)` — un bundle app
--     ancien qui appellerait `p_blood_type` reçoit une erreur PostgREST et
--     bascule sur son repli client déjà présent (`rpcMissing`) : dégradé sûr ;
--   • le nouveau client envoie `p_blood_types` / `p_sickle_cells` : tant que ce
--     bloc n'est pas exécuté, la RPC échoue → repli client (qui gère déjà les
--     tableaux) assure le deck.
-- Comportement tableau vide/null = pas de filtre (équivalent de l'ancien '').
-- Idempotent : exécutable plusieurs fois.
-- ══════════════════════════════════════════════════════════════════════

-- L'ancienne surcharge de moderation/admin a p_gender en dernier : elle avait
-- un type-signature different et survivait au DROP ci-dessus.
drop function if exists get_candidate_profiles(integer, uuid, text, text, text, integer, integer, text);
drop function if exists get_candidate_profiles(integer, uuid, text, text, text, text, integer, integer);

create or replace function get_candidate_profiles(
  p_limit integer default 30,
  p_after uuid default null,
  p_gender text default null,
  p_city text default null,
  p_blood_types text[] default null,
  p_sickle_cells text[] default null,
  p_age_min integer default null,
  p_age_max integer default null
)
returns setof profiles
language sql stable
as $$
  select p.*
  from profiles p
  where p.user_id <> auth.uid()
    and p.banned_at is null
    and not exists (
      select 1 from swipes s
      where s.swiper_id = auth.uid()
        and s.swiped_id = p.user_id
    )
    -- Modération : blocage bilatéral (bloqueur OU bloqué = invisible).
    and not exists (
      select 1 from user_blocks b
      where (b.user_id = auth.uid() and b.blocked_user_id = p.user_id)
         or (b.user_id = p.user_id and b.blocked_user_id = auth.uid())
    )
    and (p_after is null or p.user_id > p_after)
    -- Matching strict : un profil ne voit que le genre opposé.
    and (p_gender is null or lower(p.gender) = lower(p_gender))
    and (p_city is null or p.city ilike '%' || p_city || '%')
    -- Compatibilité médicale automatique. Un viewer AA peut rencontrer les
    -- génotypes déclarés (CC compris) ; tout autre statut connu/inconnu ne voit
    -- que AA. Les statuts manquants chez les candidats sont exclus.
    and p.sickle_cell = any(
      case
        when (select upper(trim(v.sickle_cell)) from profiles v where v.user_id = auth.uid()) = 'AA'
          then array['AA','AS','AC','SS','SC','CC']::text[]
        else array['AA']::text[]
      end
    )
    -- Multi-sélection : vide/null = aucun filtre (ancien comportement '').
    and (
      p_blood_types is null
      or cardinality(p_blood_types) = 0
      or p.blood_type = any(p_blood_types)
    )
    and (
      p_sickle_cells is null
      or cardinality(p_sickle_cells) = 0
      or p.sickle_cell = any(p_sickle_cells)
    )
    -- Âge en années révolues : équivalent exact du calculateAge de l'app.
    and (
      p.birth_date is null
      or (
        date_part('year', age(p.birth_date::date)) >= coalesce(p_age_min, 0)
        and date_part('year', age(p.birth_date::date)) <= coalesce(p_age_max, 200)
      )
    )
  order by p.user_id
  limit greatest(p_limit, 1);
$$;

revoke execute on function get_candidate_profiles(integer, uuid, text, text, text[], text[], integer, integer) from public;
grant execute on function get_candidate_profiles(integer, uuid, text, text, text[], text[], integer, integer) to authenticated;
