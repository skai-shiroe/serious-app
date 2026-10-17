import { supabase } from '@/lib/supabase';
import { fetchBlockedIds } from '@/lib/moderation';

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
 *  1. priorite a la RPC `get_candidate_profiles` : exclusion des swipes, bornes
 *     d'age ET genre du visiteur filtres cote serveur ;
 *  2. pagination par CURSEUR (`user_id` croissant) : chaque page reste petite,
 *     et comme le curseur avance, le filtrage ne saute jamais de profil ;
 *  3. repli sans RPC : profils lus par pages bornees, avec exclusion, age ET
 *     genre filtres dans la MEME boucle (on ne lit pas des pages pour rien).
 *
 * Matching strict par genre : un profil ne voit QUE le genre oppose. La regle
 * est appliquee cote serveur (parametre `p_gender` de la RPC, clause `.eq` du
 * repli) ET recontrolee cote client (`matchesTargetGender`) : si la RPC en
 * base n'a pas encore ete mise a jour avec `p_gender`, son erreur declenche le
 * repli — qui, lui, filtre deja le genre — au lieu de laisser passer n'importe
 * qui.
 */

/** Filtres du deck (les bornes d'age sont appliquees par la RPC). */
export type CandidateFilters = {
  ageMin: number;
  ageMax: number;
  city: string;
  /** Groupes sanguins coches (multi-selection) : `[]` = aucun filtre. */
  bloodType: string[];
  /** Genotypes coches (multi-selection) : `[]` = aucun filtre. */
  sickleCell: string[];
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
/** Nombre maximum de pages de profils parcourues dans le repli (8 x 50 = 400 profils). */
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
 * Filtre MULTI-selection : valeurs boutes, vide -> `null` (la RPC interprete
 * `null` ET `array[]` comme « aucun filtre », l'equivalent de l'ancien `''`).
 */
function normalizeFilterList(values: string[] | null | undefined): string[] | null {
  if (!values) return null;
  const trimmed = values.map((v) => (v || '').trim()).filter((v) => v.length > 0);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Genre attendu par l'utilisateur : on ne montre QUE le genre oppose
 * (`homme` <-> `femme`).
 *
 * Valeur absente ou inconnue -> `null` = aucun filtre : un profil sans genre
 * ne doit jamais disparaitre par erreur (il est ecarte a la creation, mais les
 * anciens comptes peuvent en manquer).
 */
export function targetGenderFor(viewerGender: string | null | undefined): string | null {
  const normalized = (viewerGender || '').trim().toLowerCase();
  if (normalized === 'homme') return 'femme';
  if (normalized === 'femme') return 'homme';
  return null;
}

/**
 * Filet de securite cote client : le profil est-il du genre attendu ?
 * Vrai si le genre du visiteur est inconnu (pas de filtre applique).
 */
export function matchesTargetGender(
  profileGender: string | null | undefined,
  viewerGender: string | null | undefined
): boolean {
  const target = targetGenderFor(viewerGender);
  if (!target) return true;
  return (profileGender || '').trim().toLowerCase() === target;
}

/** Age en annees revolues, ou `null` si la date est absente/illisible. */
function calculateAge(birthDate?: string | null): number | null {
  if (!birthDate) return null;

  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Profil dans la tranche d'age demandee ?
 *
 * Meme regle que la RPC (`date_part('year', age(birth_date))`) : une date de
 * naissance absente ou illisible n'exclut pas le profil.
 */
export function isAgeInRange(
  birthDate: string | null | undefined,
  min: number | null,
  max: number | null
): boolean {
  const age = calculateAge(birthDate);
  if (age === null) return true;
  if (min !== null && age < min) return false;
  if (max !== null && age > max) return false;
  return true;
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
  filters: CandidateFilters,
  targetGender: string | null
): Promise<any[]> {
  const { data, error } = await supabase.rpc('get_candidate_profiles', {
    p_limit: Math.min(Math.max(limit, 1), RPC_PAGE_MAX),
    p_after: after,
    p_city: normalizeFilter(filters.city),
    p_blood_types: normalizeFilterList(filters.bloodType),
    p_sickle_cells: normalizeFilterList(filters.sickleCell),
    p_age_min: filters.ageMin,
    p_age_max: filters.ageMax,
    p_gender: targetGender,
  });

  if (error) throw error;
  return data || [];
}

/**
 * Repli sans RPC : profils parcourus par pages bornees, avec exclusion des
 * swipes, des blocages (bilateral) et bornes d'age filtrees ici
 * (equivalent de ce que fait la RPC).
 */
async function fetchViaFallback(
  userId: string,
  limit: number,
  after: string | null,
  filters: CandidateFilters,
  targetGender: string | null,
  blocked: Set<string>
): Promise<CandidatePage> {
  const swiped = await fetchSwipedIds(userId);
  const city = normalizeFilter(filters.city);
  const bloodTypes = normalizeFilterList(filters.bloodType);
  const sickleCells = normalizeFilterList(filters.sickleCell);

  const profiles: any[] = [];
  let cursor = after;

  for (let page = 0; page < FALLBACK_MAX_PAGES && profiles.length < limit; page++) {
    let query = supabase
      .from('profiles')
      .select('*')
      .order('user_id', { ascending: true })
      .limit(FALLBACK_PROFILE_PAGE);

    if (cursor) query = query.gt('user_id', cursor);
    // Genre strict : meme regle que la RPC, cote serveur (PostgREST).
    // `ilike` sans joker = egalite insensible a la casse (cf. `lower()` en SQL).
    if (targetGender) query = query.ilike('gender', targetGender);
    if (city) query = query.ilike('city', `%${city}%`);
    if (bloodTypes) query = query.in('blood_type', bloodTypes);
    if (sickleCells) query = query.in('sickle_cell', sickleCells);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const profile of data) {
      // Le curseur avance profil par profil : si on s'arrete au quota, la
      // prochaine page reprend exactement apres le dernier profil retenu.
      cursor = profile.user_id;
      if (profile.user_id === userId) continue;
      if (swiped.has(profile.user_id)) continue;
      // Moderation : un blocage bilateral exclut le profil dans les 2 sens.
      if (blocked.has(profile.user_id)) continue;
      // Age filtre DANS la boucle : on continue a paginer jusqu'a obtenir
      // `limit` profils reellement dans la tranche demandee.
      if (!isAgeInRange(profile.birth_date, filters.ageMin, filters.ageMax)) continue;

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
  /** Genre du visiteur (`profiles.gender`) : impose le genre oppose. */
  viewerGender?: string | null;
}): Promise<CandidatePage> {
  const { userId, limit, after, filters, viewerGender = null } = options;
  const targetGender = targetGenderFor(viewerGender);
  // Moderation : les bloques (2 sens) sont exclus partout. La RPC SQL le
  // fait elle-meme (sql/moderation.sql) ; pour le repli et le filet de
  // securite ci-dessous, le client les connait des le depart (un seul
  // appel, en parallele des pages).
  const blockedPromise = fetchBlockedIds(userId);

  if (!rpcMissing) {
    try {
      const profiles = await fetchViaRpc(limit, after, filters, targetGender);
      const blocked = await blockedPromise;
      const kept = (profiles as any[]).filter(
        (p: any) => p && !blocked.has(p.user_id)
      );
      const cursor =
        kept.length > 0 ? kept[kept.length - 1].user_id : after;
      return { profiles: kept, cursor, usedRpc: true };
    } catch (error: any) {
      const message = String(error?.message || '');
      if (error?.code === 'PGRST202' || message.includes('get_candidate_profiles')) {
        rpcMissing = true;
      }
    }
  }

  const blocked = await blockedPromise;
  return fetchViaFallback(userId, limit, after, filters, targetGender, blocked);
}
