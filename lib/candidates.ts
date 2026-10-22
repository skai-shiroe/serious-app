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
 * La RPC `get_candidate_profiles` est obligatoire : elle applique les règles
 * de visibilité, de compatibilité et de pays côté serveur, sans exposer les
 * colonnes privées de `profiles`.
 *
 * Matching strict par genre : un profil ne voit que le genre opposé. La règle
 * est appliquée côté serveur puis revérifiée côté client comme garde-fou.
 */

/** Filtres du deck (les bornes d'age sont appliquees par la RPC). */
export type CandidateFilters = {
  ageMin: number;
  ageMax: number;
  city: string;
};

export type CandidatePage = {
  profiles: any[];
  /** Curseur de pagination : `user_id` du dernier profil parcouru. */
  cursor: string | null;
  usedRpc: true;
};

/** Taille maximale demandee a la RPC en une fois. */
const RPC_PAGE_MAX = 50;
/** Transforme un filtre vide en `null` (l'API attend `null`, pas `''`). */
function normalizeFilter(value: string): string | null {
  const trimmed = (value || '').trim();
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

/** Génotypes autorisés par la règle de compatibilité définie pour Geno. */
export function compatibleGenotypesFor(viewerGenotype: string | null | undefined): string[] {
  const genotype = (viewerGenotype || '').trim().toUpperCase();
  // AA n'apporte ni variant S ni C : les génotypes proposés, dont CC, restent compatibles.
  if (genotype === 'AA') return ['AA', 'AS', 'AC', 'SS', 'SC', 'CC'];
  // Par prudence, statut absent/inconnu ou autre variant : ne proposer que AA.
  return ['AA'];
}

/**
 * Profil dans la tranche d'age demandee ?
 *
 * L'âge est calculé par la RPC ; une valeur absente n'exclut pas le profil.
 */
export function isAgeInRange(
  age: number | null | undefined,
  min: number | null,
  max: number | null
): boolean {
  if (age == null || !Number.isFinite(age)) return true;
  if (min !== null && age < min) return false;
  if (max !== null && age > max) return false;
  return true;
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
    // Health markers are not user-selectable: response differences would let
    // someone probe another profile's private medical information.
    p_blood_types: null,
    p_sickle_cells: null,
    p_age_min: filters.ageMin,
    p_age_max: filters.ageMax,
    p_gender: targetGender,
  });

  if (error) throw error;
  return data || [];
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
  const profiles = await fetchViaRpc(limit, after, filters, targetGender);
  const blocked = await fetchBlockedIds(userId);
  const kept = profiles.filter((p: any) => p && !blocked.has(p.user_id));
  return {
    profiles: kept,
    cursor: kept.length > 0 ? kept[kept.length - 1].user_id : after,
    usedRpc: true,
  };
}
