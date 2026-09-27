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
 *
 * UNE exception a la regle "aucun reseau" : `validateSession()`, appelee une
 * seule fois au demarrage. La lecture locale ne peut pas savoir qu'un compte a
 * ete supprime cote Supabase (la session survit dans le stockage de l'appareil,
 * et le JWT reste signe valide jusqu'a expiration) : sans ce controle, l'app
 * reste "connectee" avec un utilisateur inexistant et toute ecriture echoue
 * (cle etrangere profiles.user_id -> auth.users).
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

/** L'erreur signifie-t-elle que la session n'est plus valable cote serveur ? */
function isSessionInvalid(error: any): boolean {
  if (!error) return false;

  const status = error.status ?? error.code;
  const message = String(error.message ?? '').toLowerCase();

  return (
    status === 401 ||
    status === 403 ||
    message.includes('user from sub claim in jwt does not exist') ||
    message.includes('user_not_found') ||
    message.includes('session_not_found') ||
    message.includes('invalid refresh token') ||
    message.includes('refresh token not found') ||
    message.includes('jwt expired')
  );
}

/**
 * Supprime la session stockee sur l'appareil, SANS appel reseau.
 * `scope: 'local'` est indispensable pour un compte supprime : l'appel de
 * deconnexion serveur echouerait (401) et laisserait la session en place.
 */
export async function forgetSession(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // best effort : on vide le cache local quoi qu'il arrive
  }
  resetSessionCache();
}

/**
 * Valide la session aupres du serveur — a appeler UNE fois, au demarrage.
 *
 * - session valide            -> renvoie l'utilisateur (rafraichi depuis le serveur) ;
 * - session morte (compte supprime, refresh impossible) -> deconnexion locale + null ;
 * - panne reseau              -> conserve la session locale (jamais de deconnexion
 *   parce qu'on est simplement hors ligne).
 */
export async function validateSession(): Promise<User | null> {
  await ensureSessionLoaded();
  if (!currentUser) return null;

  try {
    const { data, error } = await supabase.auth.getUser();

    if (!error && data.user) {
      syncSessionUser(data.user);
      return data.user;
    }

    if (isSessionInvalid(error)) {
      console.warn(
        '[Session] session invalide cote serveur (compte supprime ?) : deconnexion locale'
      );
      await forgetSession();
      return null;
    }

    console.warn(
      '[Session] validation impossible, session locale conservee :',
      error?.message || error
    );
    return currentUser;
  } catch (error) {
    console.warn('[Session] validation impossible, session locale conservee :', error);
    return currentUser;
  }
}
