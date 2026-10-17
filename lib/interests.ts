import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

/**
 * Centres d interet DYNAMIQUES (table `interests`, bloc 11).
 *
 * - source de verite : Supabase, gere depuis admin-web -> /referentiels ;
 * - cache AsyncStorage : la liste s affiche immediatement, meme hors ligne ;
 * - FALLBACK_INTERESTS : premier lancement sans reseau (ou table vide).
 *
 * Les profils stockent le LABEL dans profiles.interests (text[]) : un
 * interet desactive n est plus propose mais reste affiche tel quel sur
 * les profils existants.
 */
export const FALLBACK_INTERESTS = [
  'Sport', 'Voyage', 'Musique', 'Cinéma', 'Lecture', 'Cuisine', 'Art',
  'Jeux vidéo', 'Technologie', 'Nature', 'Photographie', 'Mode',
  'Animaux', 'Fitness', 'Danse',
];

/** Minimum impose a la creation / edition du profil. */
export const MIN_INTERESTS = 5;

const CACHE_KEY = 'geno:interests:v1';

/** Memoire session : evite de relancer la table a chaque ecran. */
let memory: string[] | null = null;

export async function fetchInterests(): Promise<string[]> {
  if (memory && memory.length > 0) return memory;

  // 1) Cache local d abord : affichage immediat, utile hors ligne.
  let cached: string[] | null = null;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) cached = parsed;
    }
  } catch {}

  // 2) Reseau : source de verite (ordre admin, actifs seulement).
  try {
    const { data, error } = await supabase
      .from('interests')
      .select('label')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true });
    if (error) throw error;
    const labels = (data || []).map((row) => row.label as string);
    if (labels.length > 0) {
      memory = labels;
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(labels)).catch(() => {});
      return memory;
    }
  } catch {
    // Reseau/RLS en echec : on retombe sur le cache, puis sur le fallback.
    // Echec NON memorise en memoire : on reessayera au prochain appel.
  }

  if (cached) return cached;
  return FALLBACK_INTERESTS;
}

/** Oublie le cache memoire (apres une edition admin, par exemple). */
export function resetInterestsCache(): void {
  memory = null;
}
