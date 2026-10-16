import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Cote navigateur uniquement : le panneau est 100 % client (comme
// l app mobile). Sur le serveur (prerender) pas de storage.
const storage = typeof window !== 'undefined' ? window.localStorage : undefined;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

/** Roles qui accedent au panneau (meme regle que l app mobile). */
export const ADMIN_ROLES = ['admin', 'manager'] as const;

export const isAdminRole = (role: string | null | undefined): boolean =>
  role !== null && role !== undefined && (ADMIN_ROLES as readonly string[]).includes(role);
