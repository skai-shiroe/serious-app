import { supabase } from '@/lib/supabase';

/**
 * Moderation — signaler / bloquer (bloquant pour les stores).
 *
 * - Blocage BILATERAL : A ne voit plus B et B ne voit plus A
 *   (deck via RPC SQL, conversations, envoi de messages).
 * - Signalement : alimente la file admin, ne bloque rien tout seul.
 */

export type ReportReason = 'fake' | 'harassment' | 'inappropriate' | 'spam' | 'other';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'fake', label: 'Faux profil / usurpation' },
  { value: 'harassment', label: 'Harcèlement / menaces' },
  { value: 'inappropriate', label: 'Contenu inapproprié' },
  { value: 'spam', label: 'Spam / arnaque' },
  { value: 'other', label: 'Autre motif' },
];

export function reportReasonLabel(reason: string | null | undefined): string {
  return REPORT_REASONS.find((r) => r.value === reason)?.label || 'Signalement';
}

/**
 * Identifiants bloques DANS LES DEUX SENS :
 * - que j'ai bloques,
 * - qui m'ont bloque.
 * Un seul appel, utilise pour le deck (repli), les conversations et le chat.
 */
export async function fetchBlockedIds(userId: string): Promise<Set<string>> {
  const blocked = new Set<string>();
  try {
    const { data, error } = await supabase
      .from('user_blocks')
      .select('user_id, blocked_user_id')
      .or(`user_id.eq.${userId},blocked_user_id.eq.${userId}`);
    if (error) throw error;
    for (const row of data || []) {
      if (row.user_id === userId) blocked.add(row.blocked_user_id);
      else blocked.add(row.user_id);
    }
  } catch (error) {
    console.warn('[Moderation] lecture des blocages impossible :', (error as any)?.message || error);
  }
  return blocked;
}

/** Ai-je bloque cet utilisateur (sens unique, pour le libelle Bloquer/Debloquer) ? */
export async function isUserBlocked(userId: string, otherUserId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_blocks')
      .select('blocked_user_id')
      .eq('user_id', userId)
      .eq('blocked_user_id', otherUserId)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  } catch {
    return false;
  }
}

export async function blockUser(userId: string, otherUserId: string): Promise<void> {
  const { error } = await supabase
    .from('user_blocks')
    .insert({ user_id: userId, blocked_user_id: otherUserId });
  if (error) throw error;
}

export async function unblockUser(userId: string, otherUserId: string): Promise<void> {
  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('user_id', userId)
    .eq('blocked_user_id', otherUserId);
  if (error) throw error;
}

export async function reportUser(
  reporterId: string,
  reportedUserId: string,
  reason: ReportReason,
  details?: string
): Promise<void> {
  const { error } = await supabase.from('user_reports').insert({
    reporter_id: reporterId,
    reported_user_id: reportedUserId,
    reason,
    details: (details || '').trim() || null,
  });
  if (error) throw error;
}
