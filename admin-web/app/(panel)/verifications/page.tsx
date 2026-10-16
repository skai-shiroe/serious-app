'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { VerificationRow, VerificationStatus } from '@/lib/types';
import { PageHeader, Pill, formatDate } from '@/components/ui';
import VerifDetail from '@/components/verif-detail';

const PAGE_SIZE = 25;

const TABS: { key: VerificationStatus | 'all'; label: string }[] = [
  { key: 'pending', label: 'En attente' },
  { key: 'approved', label: 'Validees' },
  { key: 'rejected', label: 'Refusees' },
  { key: 'all', label: 'Toutes' },
];

export default function VerificationsPage() {
  const [tab, setTab] = useState<VerificationStatus | 'all'>('pending');
  const [rows, setRows] = useState<VerificationRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<VerificationRow | null>(null);

  const load = useCallback(async (status: VerificationStatus | 'all', from: number) => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_verifications_queue', {
      p_status: status === 'all' ? null : status,
      p_limit: PAGE_SIZE,
      p_offset: from,
    });
    if (err) setError(err.message);
    else setRows((data ?? []) as VerificationRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    setOffset(0);
    load(tab, 0);
  }, [tab, load]);

  const changeTab = (key: VerificationStatus | 'all') => {
    setTab(key);
    setSelected(null);
  };

  const statusPill = (status: VerificationStatus) =>
    status === 'pending' ? (
      <Pill tone="amber">En attente</Pill>
    ) : status === 'approved' ? (
      <Pill tone="green">Validee</Pill>
    ) : (
      <Pill tone="red">Refusee</Pill>
    );

  return (
    <div>
      <PageHeader
        title="Verifications"
        subtitle="Identite et genotype — documents prives, URLs signees de 5 minutes."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => changeTab(t.key)}
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
          <p className="p-10 text-center text-sm text-slate-500">Aucune demande dans cet onglet.</p>
        ) : (
          <table className="panel-table">
            <thead>
              <tr>
                <th>Membre</th>
                <th>Type</th>
                <th>Deposee le</th>
                <th>Valeur declaree</th>
                <th>Statut</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td>
                    <p className="font-semibold">
                      {row.first_name ?? '?'} {row.last_name ?? ''}
                    </p>
                    <p className="text-xs text-slate-500">{row.city ?? '—'}</p>
                  </td>
                  <td>
                    <Pill tone={row.type === 'identity' ? 'blue' : 'slate'}>
                      {row.type === 'identity' ? 'Identite' : 'Genotype'}
                    </Pill>
                  </td>
                  <td>{formatDate(row.created_at)}</td>
                  <td>{row.declared_value || '—'}</td>
                  <td>{statusPill(row.status)}</td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="btn-ghost !py-1.5"
                      onClick={() => setSelected(row)}
                    >
                      <Eye size={15} />
                      Ouvrir
                    </button>
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

      {selected ? (
        <VerifDetail
          row={selected}
          onClose={() => setSelected(null)}
          onDone={() => load(tab, offset)}
        />
      ) : null}
    </div>
  );
}
