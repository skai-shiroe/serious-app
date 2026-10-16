'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageCircle, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { CoachingComment } from '@/lib/types';
import { formatDateTime } from './ui';

type CommentWithAuthor = CoachingComment & { author: string };

/**
 * Moderation des commentaires d un article : liste + suppression
 * (policy coaching_comments_admin_delete du bloc 10).
 */
export default function CommentsPanel({
  postId,
  onClose,
}: {
  postId: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<CommentWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('coaching_comments')
      .select('id, post_id, user_id, content, created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    const comments = (data ?? []) as CoachingComment[];
    const ids = [...new Set(comments.map((c) => c.user_id).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .in('user_id', ids);
      for (const p of profiles ?? []) {
        names.set(
          p.user_id as string,
          `${(p.first_name as string) ?? ''} ${(p.last_name as string) ?? ''}`.trim() || 'Membre',
        );
      }
    }
    setRows(
      comments.map((c) => ({
        ...c,
        author: (c.user_id && names.get(c.user_id)) || 'Membre',
      })),
    );
    setLoading(false);
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    if (!window.confirm('Supprimer definitivement ce commentaire ?')) return;
    setBusyId(id);
    const { error: err } = await supabase.from('coaching_comments').delete().eq('id', id);
    if (err) setError(err.message);
    else await load();
    setBusyId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <MessageCircle size={18} className="text-brand-600" />
            <h2 className="text-lg font-bold">Commentaires</h2>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost !px-2.5" aria-label="Fermer">
            <X size={16} />
          </button>
        </div>

        {error ? (
          <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" /> Chargement…
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">Aucun commentaire.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-xl border border-slate-200 p-4">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{row.author}</p>
                  <span className="text-xs text-slate-400">
                    {formatDateTime(row.created_at)}
                  </span>
                </div>
                <p className="text-sm text-slate-600">{row.content}</p>
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    className="btn-ghost !px-2.5 !py-1 !text-red-600"
                    disabled={busyId === row.id}
                    onClick={() => remove(row.id)}
                  >
                    {busyId === row.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
