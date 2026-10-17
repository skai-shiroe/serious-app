import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

/**
 * Villes proposees dans les selecteurs (formulaire de profil ET filtre
 * du deck), MAINTENANT PAR PAYS (table `cities`, bloc 11).
 *
 * - fetchCities(countryCode) : liste active du pays (repli offline sur
 *   FALLBACK_CITIES_BY_COUNTRY, cache AsyncStorage) ;
 * - fetchCities(null)        : toutes les villes (filtre deck sans pays) ;
 * - CITIES : ancienne liste Togo, conservee pour les usages sans pays.
 *
 * Regle : des VILLES uniquement (pas de prefectures / regions). Les
 * doublons exacts sont ecartes ; une seule graphie par ville.
 */
const FALLBACK_TG = [
  'Lomé', 'Sokodé', 'Kara', 'Atakpamé',
  'Dapaong', 'Tsévié', 'Aného', 'Kpalimé',
  'Notsé', 'Bassar', 'Amlamé', 'Badou',
  'Bafilo', 'Baguida', 'Bohou', 'Cinkassé',
  'Danyi', 'Kévé', 'Kandé', 'Kpagouda',
  'Mango', 'Niamtougou', 'Pagouda', 'Tchamba',
  'Vogan', 'Tabligbo', 'Guérin-Kouka',
  'Kanté', 'Mô', 'Tandjouaré',
];

const FALLBACK_BJ = [
  'Cotonou', 'Porto-Novo', 'Parakou', 'Abomey', 'Bohicon',
  'Djougou', 'Natitingou', 'Lokossa', 'Ouidah', 'Kandi',
  'Comè', 'Allada', 'Savalou', 'Glazoué', 'Dogbo',
  'Kétou', 'Pobè', 'Sakété', 'Bassila', 'Banikoara',
  'Bopa', 'Sèmè-Kpodji', 'Toviklin', 'Segbana', 'Kouandé',
];

const FALLBACK_CI = [
  'Abidjan', 'Yamoussoukro', 'Bouaké', 'San-Pédro', 'Korhogo',
  'Daloa', 'Man', 'Gagnoa', 'Katiola', 'Abengourou',
  'Anyama', 'Divo', 'Grand-Bassam', 'Touba', 'Odienné',
  'Ferkessédougou', 'Biankouma', 'Guiglo', 'Duékoué', 'Soubré',
  'Aboisso', 'Adzopé', 'Akoupé', 'Tingrela', 'Boundiali',
];

/** Repli hors ligne par pays (codes = countries.code). */
export const FALLBACK_CITIES_BY_COUNTRY: Record<string, string[]> = {
  TG: FALLBACK_TG,
  BJ: FALLBACK_BJ,
  CI: FALLBACK_CI,
};

/** Ancienne liste unique (Togo) : repli des usages sans notion de pays. */
export const CITIES = Array.from(new Set(FALLBACK_TG)).sort((a, b) => a.localeCompare(b, 'fr'));

/** Minuscules sans accents : « fes » doit trouver « Fès ». */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const CACHE_PREFIX = 'geno:cities:';
/** Memoire session par cle (pays ou 'all'). */
const memory = new Map<string, string[]>();

/**
 * Liste des villes actives : d un pays (`countryCode`) ou de tous
 * (`null`). Ordre alphabetique insensible aux accents cote tri.
 */
export async function fetchCities(countryCode?: string | null): Promise<string[]> {
  const key = countryCode || 'all';
  const inMemory = memory.get(key);
  if (inMemory && inMemory.length > 0) return inMemory;

  // 1) Cache local : la modale s ouvre immediatement, meme hors ligne.
  let cached: string[] | null = null;
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) cached = parsed;
    }
  } catch {}

  // 2) Reseau : source de verite.
  try {
    let query = supabase
      .from('cities')
      .select('name, country_code')
      .eq('is_active', true);
    if (countryCode) query = query.eq('country_code', countryCode);
    const { data, error } = await query.order('name', { ascending: true });
    if (error) throw error;
    if (data && data.length > 0) {
      const names = Array.from(new Set(data.map((row) => row.name as string))).sort((a, b) =>
        a.localeCompare(b, 'fr')
      );
      memory.set(key, names);
      AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(names)).catch(() => {});
      return names;
    }
  } catch {
    // Echec NON memorise : on retentera au prochain appel.
  }

  if (cached) {
    memory.set(key, cached);
    return cached;
  }

  if (countryCode) return FALLBACK_CITIES_BY_COUNTRY[countryCode] ?? [];
  return CITIES;
}

