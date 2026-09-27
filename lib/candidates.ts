import { supabase } from '@/lib/supabase';

/**
 * Chargement des profils du deck (ecran Decouvrir).
 *
 * Historique du bug corrige ici : le code excluait les profils deja swipes en
 * construisant un filtre `not.in` contenant TOUS les identifiants swipes. Or
 * PostgREST envoie les filtres dans l'URL de la requete GET : au bout de
 * quelques centaines de swipes l'URL depassait la taille maximale acceptee par
 * le serveur et la requete echouait (HTTP 414 "URI Too Long"). La lecture de la
 * table `swipes` se faisait elle aussi sans limite.
 *
 * Trois regles desormais :
 *  1. priorite a la RPC `get_candidate_profiles` (exclusion cote serveur) ;
 *  2. pagination par CURSEUR (`user_id` croissant) : chaque page reste petite,
 *     et comme le curseur avance, le filtrage ne saute jamais de profil ;
 *  3. repli sans RPC : lecture des profils par pages bornees + filtre client.
 */

/** Filtres du deck (les bornes d'age sont appliquees cote client). */
export type CandidateFilters = {
  ageMin: number;
  ageMax: number;
  city: string;
  bloodType: string;
  sickleCell: string;
};

export type CandidatePage = {
  profiles: any[];
  /** Curseur de pagination : `user_id` du dernier profil parcouru. */
  cursor: string | null;
  /** true si la RPC serveur a repondu, false si le repli client a servi. */
  usedRpc: boolean;
};

/** Taille maximale demandee a la RPC en une fois. */
const RPC_PAGE_MAX = 50;
/** Taille d'une page de profils dans le repli sans RPC. */
const FALLBACK_PROFILE_PAGE = 50;
/** Nombre maximum de pages de profils parcourues dans le repli (garde-fou). */
const FALLBACK_MAX_PAGES = 8;
/** Taille d'une page de swipes dans le repli. */
const SWIPES_PAGE = 1000;
/** Nombre maximum de swipes lus dans le repli (garde-fou memoire). */
const SWIPES_MAX_SCAN = 5000;

/**
 * Memoise l'absence de la RPC : une fois qu'on sait qu'elle n'est pas deployee,
 * inutile de retenter (et de logger) a chaque page du deck.
 */
let rpcMissing = false;

/** Transforme un filtre vide en `null` (l'API attend `null`, pas `''`). */
function normalizeFilter(value: string): string | null {
  const trimmed = (value || '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Identifiants deja swipes par l'utilisateur, lus par PAGES bornees.
 * Aucune liste d'identifiants ne part dans l'URL : chaque requete reste petite.
 */
async function fetchSwipedIds(userId: string): Promise<Set<string>> {
  const ids = new Set<string>();

  for (let from = 0; from < SWIPES_MAX_SCAN; from += SWIPES_PAGE) {
    const { data, error } = await supabase
      .from('swipes')
      .select('swiped_id')
      .eq('swiper_id', userId)
      .range(from, from + SWIPES_PAGE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    data.forEach((row: any) => ids.add(row.swiped_id));
    if (data.length < SWIPES_PAGE) break;
  }

  return ids;
}

/** Voie nominale : exclusion des swipes faite par PostgreSQL. */
async function fetchViaRpc(
  limit: number,
  after: string | null,
  filters: CandidateFilters
): Promise<any[]> {
  const { data, error } = await supabase.rpc('get_candidate_profiles', {
    p_limit: Math.min(Math.max(limit, 1), RPC_PAGE_MAX),
    p_after: after,
    p_city: normalizeFilter(filters.city),
    p_blood_type: normalizeFilter(filters.bloodType),
    p_sickle_cell: normalizeFilter(filters.sickleCell),
  });

  if (error) throw error;
  return data || [];
}

/** Repli sans RPC : profils parcourus par pages, filtrage cote client. */
async function fetchViaFallback(
  userId: string,
  limit: number,
  after: string | null,
  filters: CandidateFilters
): Promise<CandidatePage> {
  const swiped = await fetchSwipedIds(userId);
  const city = normalizeFilter(filters.city);
  const bloodType = normalizeFilter(filters.bloodType);
  const sickleCell = normalizeFilter(filters.sickleCell);

  const profiles: any[] = [];
  let cursor = after;

  for (let page = 0; page < FALLBACK_MAX_PAGES && profiles.length < limit; page++) {
    let query = supabase
      .from('profiles')
      .select('*')
      .order('user_id', { ascending: true })
      .limit(FALLBACK_PROFILE_PAGE);

    if (cursor) query = query.gt('user_id', cursor);
    if (city) query = query.ilike('city', `%${city}%`);
    if (bloodType) query = query.eq('blood_type', bloodType);
    if (sickleCell) query = query.eq('sickle_cell', sickleCell);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const profile of data) {
      // Le curseur avance profil par profil : si on s'arrete au quota, la
      // prochaine page reprend exactement apres le dernier profil retenu.
      cursor = profile.user_id;
      if (profile.user_id === userId) continue;
      if (swiped.has(profile.user_id)) continue;

      profiles.push(profile);
      if (profiles.length >= limit) break;
    }

    if (data.length < FALLBACK_PROFILE_PAGE) break;
  }

  return { profiles, cursor, usedRpc: false };
}

/**
 * Profils candidats suivants, a partir du curseur `after`.
 *
 * @param after `null` pour repartir du debut du deck, sinon le curseur de la
 *              page precedente (`CandidatePage.cursor`).
 */
export async function fetchCandidateProfiles(options: {
  userId: string;
  limit: number;
  after: string | null;
  filters: CandidateFilters;
}): Promise<CandidatePage> {
  const { userId, limit, after, filters } = options;

  if (!rpcMissing) {
    try {
      const profiles = await fetchViaRpc(limit, after, filters);
      const cursor =
        profiles.length > 0 ? profiles[profiles.length - 1].user_id : after;
      return { profiles, cursor, usedRpc: true };
    } catch (error: any) {
      const message = String(error?.message || '');
      if (error?.code === 'PGRST202' || message.includes('get_candidate_profiles')) {
        rpcMissing = true;
        console.warn(
          '[Candidates] RPC get_candidate_profiles absente de la base : repli client actif (voir README, section SQL).'
        );
      } else {
        console.warn('[Candidates] RPC indisponible, repli client :', message);
      }
    }
  }

  return fetchViaFallback(userId, limit, after, filters);
}
