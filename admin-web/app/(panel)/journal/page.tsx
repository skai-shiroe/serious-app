'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { PushLogRow } from '@/lib/types';
import { PageHeader, Pill, formatDateTime } from '@/components/ui';

export default function JournalPage() {
  const [rows, setRows] = useState<PushLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_push_log', { p_limit: 100 });
    if (err) setError(err.message);
    else setRows((data ?? []) as PushLogRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Journal push"
        subtitle="Derniers envois (table push_log, purge apres 7 j par le cron)."
        actions={
          <button type="button" className="btn-ghost" onClick={load} disabled={loading}>
            <RefreshCw size={15} />
            Actualiser
          </button>
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
          <p className="p-10 text-center text-sm text-slate-500">Aucun envoi journalise.</p>
        ) : (
          <table className="panel-table">
            <thead>
              <tr>
                <th>Envoye le</th>
                <th>Titre</th>
                <th>Type</th>
                <th>Canal</th>
                <th className="text-right">Destinataires</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap">{formatDateTime(row.sent_at)}</td>
                  <td>
                    <span className="flex items-center gap-2 font-medium">
                      <Bell size={14} className="text-slate-400" />
                      {row.title || '—'}
                    </span>
                  </td>
                  <td>
                    <Pill tone="slate">{row.kind || '—'}</Pill>
                  </td>
                  <td>{row.channel || '—'}</td>
                  <td className="text-right tabular-nums">{row.target_count ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
