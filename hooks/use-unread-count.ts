import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getUser } from '@/lib/session';

/**
 * Nombre total de messages non lus de l'utilisateur, pour le badge de
 * l'onglet Messages (style WhatsApp, plafonne a 99).
 *
 * Deux requetes legere (matchs puis count) :
 *  - le count est scope aux matchs de l'utilisateur (pas besoin de se fier
 *    a une policy RLS qu'on ne voit pas ici) ;
 *  - realtime sur INSERT/UPDATE de messages, debounced : ouvrir une
 *    conversation (marquage en lu) fait descendre le badge instantanement.
 */
export function useUnreadMessagesCount(): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const user = await getUser();
      if (!user) {
        setCount(0);
        return;
      }

      const { data: matches, error: matchError } = await supabase
        .from('matches')
        .select('id')
        .or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`);
      if (matchError) throw matchError;

      if (!matches || matches.length === 0) {
        setCount(0);
        return;
      }

      const { count: unread, error } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .in('match_id', matches.map((m) => m.id))
        .eq('read', false)
        .neq('sender_id', user.id);
      if (error) throw error;

      setCount(unread ?? 0);
    } catch {
      // silencieux : le badge se revalide au prochain evenement realtime
    }
  }, []);

  useEffect(() => {
    void refresh();

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const refreshSoon = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void refresh(), 600);
    };

    const channel = supabase
      .channel('unread-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, refreshSoon)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, refreshSoon)
      .subscribe();

    return () => {
      if (debounce) clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return Math.min(count, 99);
}
