'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  MessageCircle,
  Newspaper,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { CoachingPost } from '@/lib/types';
import { PageHeader, Pill, formatDate } from '@/components/ui';
import CoachingForm from '@/components/coaching-form';
import CommentsPanel from '@/components/comments-panel';

export default function ArticlesPage() {
  const [rows, setRows] = useState<CoachingPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CoachingPost | null>(null);
  const [creating, setCreating] = useState(false);
  const [commentsFor, setCommentsFor] = useState<CoachingPost | null>(null);
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('coaching_posts')
      .select('id, user_id, title, content, category, image_url, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (err) setError(err.message);
    else setRows((data ?? []) as CoachingPost[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    supabase.auth.getUser().then(({ data }) => setAdminUserId(data.user?.id ?? null));
  }, [load]);

  const remove = async (post: CoachingPost) => {
    if (!window.confirm(`Supprimer definitivement l article « ${post.title} » ?`)) return;
    setBusyId(post.id);
    const { error: err } = await supabase.from('coaching_posts').delete().eq('id', post.id);
    if (err) setError(err.message);
    else await load();
    setBusyId(null);
  };

  return (
    <div>
      <PageHeader
        title="Articles coaching"
        subtitle="Creation, edition, suppression et commentaires — policies admin du bloc 10."
        actions={
          <>
            <button type="button" className="btn-ghost" onClick={load} disabled={loading}>
              <RefreshCw size={15} />
              Actualiser
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setCreating(true)}
              disabled={!adminUserId}
            >
              <Plus size={16} />
              Nouvel article
            </button>
          </>
        }
      />

      <div className="panel-card !p-0 overflow-hidden">
        {error ? (
          <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" /> Chargement…
          </div>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">Aucun article.</p>
        ) : (
          <table className="panel-table">
            <thead>
              <tr>
                <th>Article</th>
                <th>Categorie</th>
                <th>Publie le</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((post) => (
                <tr key={post.id} className="hover:bg-slate-50">
                  <td>
                    <div className="flex items-center gap-3">
                      {post.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.image_url}
                          alt=""
                          className="h-12 w-16 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                          <Newspaper size={18} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{post.title}</p>
                        <p className="max-w-md truncate text-xs text-slate-500">{post.content}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Pill tone="blue">{post.category}</Pill>
                  </td>
                  <td className="whitespace-nowrap">{formatDate(post.created_at)}</td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="btn-ghost !px-2.5 !py-1.5"
                        title="Commentaires"
                        onClick={() => setCommentsFor(post)}
                      >
                        <MessageCircle size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn-ghost !px-2.5 !py-1.5"
                        title="Modifier"
                        onClick={() => setEditing(post)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn-ghost !px-2.5 !py-1.5 !text-red-600"
                        title="Supprimer"
                        disabled={busyId === post.id}
                        onClick={() => remove(post)}
                      >
                        {busyId === post.id ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <Trash2 size={15} />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(creating || editing) && adminUserId ? (
        <CoachingForm
          existing={editing}
          adminUserId={adminUserId}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={load}
        />
      ) : null}

      {commentsFor ? (
        <CommentsPanel postId={commentsFor.id} onClose={() => setCommentsFor(null)} />
      ) : null}
    </div>
  );
}

