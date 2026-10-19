import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

/**
 * Pays proposes a la creation de profil : drapeau + indicatif a gauche
 * du champ telephone (aucun champ pays separe). Source : table
 * `countries` (bloc 11), geree depuis admin-web -> /referentiels,
 * avec repli sur FALLBACK_COUNTRIES au premier lancement hors ligne.
 */
export type Country = {
  code: string;
  name: string;
  dial_code: string;
  flag: string;
  min_digits: number;
  max_digits: number;
};

export const FALLBACK_COUNTRIES: Country[] = [
  { code: 'TG', name: 'Togo', dial_code: '+228', flag: '🇹🇬', min_digits: 8, max_digits: 8 },
  { code: 'BJ', name: 'Bénin', dial_code: '+229', flag: '🇧🇯', min_digits: 8, max_digits: 10 },
  { code: 'CI', name: "Côte d'Ivoire", dial_code: '+225', flag: '🇨🇮', min_digits: 8, max_digits: 10 },
  { code: 'CM', name: 'Cameroun', dial_code: '+237', flag: '🇨🇲', min_digits: 9, max_digits: 9 },
];

const CACHE_KEY = 'geno:countries:v1';

/** Memoire session : evite un appel reseau par ecran. */
let memory: Country[] | null = null;

export async function fetchCountries(): Promise<Country[]> {
  if (memory && memory.length > 0) return memory;

  // 1) Cache local d abord : la modale s ouvre immediatement.
  let cached: Country[] | null = null;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) cached = parsed;
    }
  } catch {}

  // 2) Reseau : source de verite (pays actifs, ordre admin).
  try {
    const { data, error } = await supabase
      .from('countries')
      .select('code, name, dial_code, flag, min_digits, max_digits')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    if (data && data.length > 0) {
      memory = data as Country[];
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data)).catch(() => {});
      return memory;
    }
  } catch {
    // Echec NON memorise : on retentera au prochain appel.
  }

  return cached && cached.length > 0 ? cached : FALLBACK_COUNTRIES;
}

/** Chiffres seuls, borne a la longueur max du numero national. */
export function onlyDigits(value: string, max: number): string {
  return value.replace(/\D/g, '').slice(0, max);
}

/** Indicatif + numero national -> E.164 (`+22890102030`). */
export function formatE164(dialCode: string, nationalDigits: string): string {
  const digits = nationalDigits.replace(/\D/g, '');
  if (!digits) return '';
  const dial = dialCode.replace(/[^\d+]/g, '');
  const prefixed = dial.startsWith('+') ? dial : `+${dial}`;
  return `${prefixed}${digits}`;
}

/**
 * Valide la longueur du numero national selon le pays.
 * Retourne le message d erreur, ou null si le numero est bon.
 */
export function validateNational(digits: string, country?: Country | null): string | null {
  if (!country) return null;
  const length = digits.replace(/\D/g, '').length;
  if (length < country.min_digits) {
    return `Le numéro de ${country.name} doit contenir au moins ${country.min_digits} chiffres.`;
  }
  if (length > country.max_digits) {
    return `Le numéro de ${country.name} ne peut pas dépasser ${country.max_digits} chiffres.`;
  }
  return null;
}

/**
 * Extrait le numero national d un E.164 stocke en profil.
 * Si l indicatif est inconnu (pays pas encore charge), on essaie
 * chaque indicatif de depart ; sinon on garde les chiffres tels quels.
 */
export function nationalFromE164(e164?: string | null, dialCode?: string): string {
  if (!e164) return '';
  const digits = e164.replace(/\D/g, '');
  if (!digits) return '';

  const candidates: string[] = [];
  if (dialCode) candidates.push(dialCode.replace(/\D/g, ''));
  else for (const c of FALLBACK_COUNTRIES) candidates.push(c.dial_code.replace(/\D/g, ''));

  for (const dial of candidates) {
    if (dial && digits.startsWith(dial)) return digits.slice(dial.length);
  }
  return digits;
}
