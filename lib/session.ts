import type { User } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

/**
 * Source unique de l'utilisateur courant, SANS aucun appel reseau.
 *
 * `supabase.auth.getUser()` revalide le JWT aupres du serveur a CHAQUE appel :
 * un aller-retour reseau par swipe, par message, par ecran... et un echec total
 * hors ligne. Or la session est deja stockee localement : on la lit une seule
 * fois via getSession() (lecture locale) et on la garde a jour avec
 * onAuthStateChange.
 *
 * La securite reste assuree cote serveur par les policies RLS : utiliser cet
 * identifiant ne donne aucun droit supplementaire.
 */

let currentUser: User | null = null;
let loaded = false;
let loading: Promise<void> | null = null;
let subscription: { unsubscribe: () => void } | null = null;

function syncSessionUser(sessionUser: User | null | undefined) {
  currentUser = sessionUser ?? null;
  loaded = true;
}

/** Charge la session locale (idempotent) et branche le suivi des changements d'auth. */
export function ensureSessionLoaded(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loading) return loading;

  loading = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      syncSessionUser(session?.user);
    } catch {
      syncSessionUser(null);
    }
  })();

  // Garde le cache a jour : connexion, deconnexion, rafraichissement de token
  if (!subscription) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      syncSessionUser(session?.user);
    });
    subscription = data.subscription;
  }

  return loading;
}

/** Utilisateur courant (depuis le cache local, aucun aller-retour reseau). */
export async function getUser(): Promise<User | null> {
  await ensureSessionLoaded();
  return currentUser;
}

/** Identifiant de l'utilisateur courant (depuis le cache local). */
export async function getUserId(): Promise<string | null> {
  const user = await getUser();
  return user?.id ?? null;
}

/** Version synchrone : valable une fois ensureSessionLoaded() resolu. */
export function currentUserId(): string | null {
  return currentUser?.id ?? null;
}

/** Vide le cache (tests / deconnexion forcee). */
export function resetSessionCache() {
  currentUser = null;
  loaded = false;
  loading = null;
}
