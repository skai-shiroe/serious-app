'use client';

import { useCallback, useEffect, useState } from 'react';
import { Ban, ChevronLeft, ChevronRight, CheckCheck, Loader2, Undo2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { REPORT_REASONS, type ReportRow, type ReportStatus } from '@/lib/types';
import { PageHeader, Pill, formatDateTime } from '@/components/ui';
import BanDialog from '@/components/ban-dialog';

const PAGE_SIZE = 25;

const TABS: { key: ReportStatus | 'all'; label: string }[] = [
  { key: 'pending', label: 'En attente' },
  { key: 'reviewed', label: 'Traites' },
  { key: 'dismissed', label: 'Classes sans suite' },
  { key: 'all', label: 'Tous' },
];

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportStatus | 'all'>('pending');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<ReportRow | null>(null);
  const [reasonLabels, setReasonLabels] = useState<Record<string, string>>(REPORT_REASONS);

  const load = useCallback(async (status: ReportStatus | 'all', from: number) => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_reports_queue', {
      p_status: status === 'all' ? null : status,
      p_limit: PAGE_SIZE,
      p_offset: from,
    });
    if (err) setError(err.message);
    else setRows((data ?? []) as ReportRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    setOffset(0);
    load(tab, 0);
  }, [tab, load]);

  useEffect(() => {
    void supabase.rpc('app_public_setting', { p_key: 'moderation_reasons' }).then(({ data }) => {
      if (Array.isArray(data)) setReasonLabels(Object.fromEntries(data.map((item: { value: string; label: string }) => [item.value,item.label])));
    });
  }, []);

  const setStatus = async (row: ReportRow, status: ReportStatus) => {
    setBusyId(row.id);
    const { error: err } = await supabase.rpc('admin_update_report', {
      p_id: row.id,
      p_status: status,
    });
    if (err) setError(err.message);
    else await load(tab, offset);
    setBusyId(null);
  };

  const statusPill = (status: ReportStatus) =>
    status === 'pending' ? (
      <Pill tone="amber">En attente</Pill>
    ) : status === 'reviewed' ? (
      <Pill tone="green">Traite</Pill>
    ) : (
      <Pill tone="slate">Classe sans suite</Pill>
    );

  return (
    <div>
      <PageHeader
        title="Signalements"
        subtitle="File de moderation — decision via RPC admin_update_report (audit reviewer + date)."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setTab(t.key);
              setOffset(0);
            }}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              tab === t.key
                ? 'bg-brand-600 text-white'
                : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

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
          <p className="p-10 text-center text-sm text-slate-500">Aucun signalement.</p>
        ) : (
          <table className="panel-table">
            <thead>
              <tr>
                <th>Signale</th>
                <th>Motif</th>
                <th>Signalant</th>
                <th>Le</th>
                <th>Statut</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td>
                    <p className="font-semibold">
                      {row.reported_name ?? 'Profil'}{' '}
                      {row.report_count > 1 ? (
                        <Pill tone="red">{row.report_count} signalements</Pill>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500">{row.reported_city ?? '—'}</p>
                    {row.reported_banned_at ? <Pill tone="slate">Banni</Pill> : null}
                  </td>
                  <td>
                    <p className="font-medium">{reasonLabels[row.reason] ?? row.reason}</p>
                    {row.details ? (
                      <p className="max-w-xs truncate text-xs text-slate-500" title={row.details}>
                        {row.details}
                      </p>
                    ) : null}
                  </td>
                  <td>{row.reporter_name ?? '—'}</td>
                  <td className="whitespace-nowrap">{formatDateTime(row.created_at)}</td>
                  <td>{statusPill(row.status)}</td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="btn-ghost !px-2.5 !py-1.5"
                        title="Marquer comme traite"
                        disabled={busyId === row.id || row.status === 'reviewed'}
                        onClick={() => setStatus(row, 'reviewed')}
                      >
                        {busyId === row.id ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <CheckCheck size={15} />
                        )}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost !px-2.5 !py-1.5"
                        title="Classer sans suite"
                        disabled={busyId === row.id || row.status === 'dismissed'}
                        onClick={() => setStatus(row, 'dismissed')}
                      >
                        <Undo2 size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn-ghost !px-2.5 !py-1.5 !text-red-600"
                        title={row.reported_banned_at ? 'Debannir' : 'Bannir le profil signale'}
                        onClick={() => setBanTarget(row)}
                      >
                        <Ban size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
          <button
            type="button"
            className="btn-ghost !py-1.5"
            disabled={offset === 0 || loading}
            onClick={() => {
              const next = Math.max(0, offset - PAGE_SIZE);
              setOffset(next);
              load(tab, next);
            }}
          >
            <ChevronLeft size={15} /> Precedent
          </button>
          <span className="text-slate-500">
            lignes {rows.length === 0 ? 0 : offset + 1}–{offset + rows.length}
          </span>
          <button
            type="button"
            className="btn-ghost !py-1.5"
            disabled={rows.length < PAGE_SIZE || loading}
            onClick={() => {
              const next = offset + PAGE_SIZE;
              setOffset(next);
              load(tab, next);
            }}
          >
            Suivant <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {banTarget ? (
        <BanDialog
          userId={banTarget.reported_user_id}
          userName={banTarget.reported_name ?? 'Profil signale'}
          banned={Boolean(banTarget.reported_banned_at)}
          onClose={() => setBanTarget(null)}
          onDone={() => load(tab, offset)}
        />
      ) : null}
    </div>
  );
}

