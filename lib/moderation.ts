import { supabase } from '@/lib/supabase';
import { fetchAppSetting } from '@/lib/app-settings';

/**
 * Moderation — signaler / bloquer (bloquant pour les stores).
 *
 * - Blocage BILATERAL : A ne voit plus B et B ne voit plus A
 *   (deck via RPC SQL, conversations, envoi de messages).
 * - Signalement : alimente la file admin, ne bloque rien tout seul.
 */

export type ReportReason = string;

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'fake', label: 'Faux profil / usurpation' },
  { value: 'harassment', label: 'Harcèlement / menaces' },
  { value: 'inappropriate', label: 'Contenu inapproprié' },
  { value: 'spam', label: 'Spam / arnaque' },
  { value: 'other', label: 'Autre motif' },
];

export async function fetchReportReasons(): Promise<{ value: string; label: string }[]> {
  const rows = await fetchAppSetting<Array<{ value: string; label: string }>>('moderation_reasons', REPORT_REASONS);
  return Array.isArray(rows) && rows.length ? rows.filter((row) => row.value && row.label) : REPORT_REASONS;
}

export function reportReasonLabel(reason: string | null | undefined): string {
  return REPORT_REASONS.find((r) => r.value === reason)?.label || 'Signalement';
}

/**
 * Identifiants bloques DANS LES DEUX SENS :
 * - que j'ai bloques,
 * - qui m'ont bloque.
 * Un seul appel, utilise pour le deck (repli), les conversations et le chat.
 */
export async function fetchBlockedIds(_userId: string): Promise<Set<string>> {
  const blocked = new Set<string>();
  try {
    const { data, error } = await supabase.rpc('get_my_blocked_user_ids');
    if (error) throw error;
    for (const row of data || []) blocked.add(row.user_id);
  } catch {}
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
  reason: string,
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
