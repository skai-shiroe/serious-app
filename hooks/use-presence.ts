import { useEffect } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';

/** Frequence d'ecriture du heartbeat `presence` (app au premier plan). */
export const PRESENCE_HEARTBEAT_MS = 45000;

/** Fenetre pendant laquelle un heartbeat est considere comme "En ligne". */
export const PRESENCE_ONLINE_MS = 90000;

/** Vrai si l'utilisateur a donne signe de vie recemment. */
export function isRecentlySeen(lastSeen?: string | null) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < PRESENCE_ONLINE_MS;
}

/**
 * Maintient la ligne `presence` de l'utilisateur a jour tant que l'app est au
 * premier plan.
 *
 * Sans ce hook, le heartbeat n'existait que dans l'ecran de chat : un
 * utilisateur qui swipait ou lisait sa liste de messages apparaissait
 * "Hors ligne" pour tout le monde.
 */
export function usePresenceHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const beat = async () => {
      try {
        // getSession() lit la session locale : aucun aller-retour reseau,
        // contrairement a getUser() qui revalide le JWT cote serveur.
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user || cancelled) return;
        await supabase
          .from('presence')
          .upsert({ user_id: user.id, last_seen: new Date().toISOString() });
      } catch {
        // Indicateur "best effort" : une erreur reseau ne doit rien casser
      }
    };

    const start = () => {
      if (interval) return;
      void beat();
      interval = setInterval(() => { void beat(); }, PRESENCE_HEARTBEAT_MS);
    };

    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    start();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });

    return () => {
      cancelled = true;
      stop();
      subscription.remove();
    };
  }, [enabled]);
}
