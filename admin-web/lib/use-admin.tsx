'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { isAdminRole, supabase } from './supabase';

export type AdminState = {
  /** Vrai tant que session + role ne sont pas connus. */
  loading: boolean;
  /** Vrai seulement si connecte ET role admin/manager. */
  isAdmin: boolean;
  /** Vrai des que la session est connue (mem si role refuse). */
  checked: boolean;
  user: User | null;
  role: string | null;
};

/**
 * Session + role admin (profiles.role), comme le gate cote mobile
 * (app/admin/*.tsx). La securite reelle reste RLS + les gardes
 * is_admin() des RPC : ce hook sert uniquement a l interface.
 */
export function useAdmin(): AdminState {
  const [state, setState] = useState<AdminState>({
    loading: true,
    isAdmin: false,
    checked: false,
    user: null,
    role: null,
  });

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data.user ?? null;
        if (!alive) return;
        if (!user) {
          setState({ loading: false, isAdmin: false, checked: true, user: null, role: null });
          return;
        }
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!alive) return;
        const role = (profile?.role as string | null) ?? null;
        setState({
          loading: false,
          isAdmin: isAdminRole(role),
          checked: true,
          user,
          role,
        });
      } catch {
        if (alive) {
          setState({ loading: false, isAdmin: false, checked: true, user: null, role: null });
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return state;
}

/** Affiche pendant la verification de session/role. */
export function FullScreenSpinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-slate-500">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-brand-500" />
      {label ? <p className="text-sm">{label}</p> : null}
    </div>
  );
}
