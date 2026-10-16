'use client';

import { useEffect, useState } from 'react';
import { Check, FileImage, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { VerificationDoc, VerificationRow } from '@/lib/types';
import { Pill, formatDateTime } from './ui';

/**
 * Visionneuse d une demande : documents via URL signee 5 min (bucket
 * prive `verifications`, RLS verif_read admin) + decision via la RPC
 * `review_verification` (qui re-verifie is_admin() cote SQL).
 */
export default function VerifDetail({
  row,
  onClose,
  onDone,
}: {
  row: VerificationRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [docError, setDocError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectMode, setRejectMode] = useState(false);
  const [genoValue, setGenoValue] = useState(row.declared_value ?? 'AA');

  useEffect(() => {
    let alive = true;
    (async () => {
      const docs: VerificationDoc[] = row.documents ?? [];
      const map: Record<string, string> = {};
      for (const doc of docs) {
        const { data, error } = await supabase.storage
          .from('verifications')
          .createSignedUrl(doc.path, 300);
        if (!error && data) map[doc.path] = data.signedUrl;
      }
      if (!alive) return;
      setUrls(map);
      if (docs.length > 0 && Object.keys(map).length === 0) {
        setDocError('Impossible de generer les URLs signees (droits lecture ?).');
      }
      setLoadingDocs(false);
    })();
    return () => {
      alive = false;
    };
  }, [row]);

  const decide = async (approve: boolean) => {
    if (busy) return;
    if (!approve && rejectReason.trim().length < 3) {
      setActionError('Motif de refus obligatoire (visible par l utilisateur).');
      return;
    }
    setBusy(true);
    setActionError(null);
    const { error } = await supabase.rpc('review_verification', {
      p_id: row.id,
      p_approve: approve,
      p_verified_value: approve && row.type === 'genotype' ? genoValue : null,
      p_reason: approve ? null : rejectReason.trim(),
    });
    setBusy(false);
    if (error) {
      setActionError(error.message);
      return;
    }
    onDone();
    onClose();
  };

  const isPending = row.status === 'pending';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">
              {row.first_name ?? '?'} {row.last_name ?? ''}
            </h2>
            <p className="text-sm text-slate-500">
              {row.city ?? 'Ville inconnue'} ·{' '}
              {row.type === 'identity' ? 'Identite' : 'Genotype'} · deposee le{' '}
              {formatDateTime(row.created_at)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost !px-2.5" aria-label="Fermer">
            <X size={16} />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <Pill tone={row.status === 'pending' ? 'amber' : row.status === 'approved' ? 'green' : 'red'}>
            {row.status === 'pending' ? 'En attente' : row.status === 'approved' ? 'Validee' : 'Refusee'}
          </Pill>
          {row.identity_verified ? <Pill tone="blue">Identite verifiee</Pill> : null}
          {row.genotype_verified ? <Pill tone="blue">Genotype verifie</Pill> : null}
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <p className="font-semibold text-slate-600">Valeur declaree</p>
            <p className="mt-1">{row.declared_value || '—'}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <p className="font-semibold text-slate-600">Valeur retenue (decision)</p>
            <p className="mt-1">{row.verified_value || '—'}</p>
          </div>
        </div>

        {row.rejection_reason ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Motif de refus transmis : {row.rejection_reason}
          </div>
        ) : null}

        <p className="mb-2 text-sm font-semibold text-slate-600">Documents (URL signee 5 min)</p>
        {loadingDocs ? (
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-6 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" /> Generation des URLs…
          </div>
        ) : docError ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {docError}
          </div>
        ) : (row.documents ?? []).length === 0 ? (
          <div className="rounded-xl bg-slate-50 p-6 text-sm text-slate-500">
            Aucun document joint.
          </div>
        ) : (
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(row.documents ?? []).map((doc) => (
              <figure key={doc.path} className="overflow-hidden rounded-xl border border-slate-200">
                <figcaption className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                  <FileImage size={14} />
                  {doc.label || doc.path}
                </figcaption>
                {urls[doc.path] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={urls[doc.path]}
                    alt={doc.label || 'Document'}
                    className="max-h-80 w-full bg-slate-100 object-contain"
                  />
                ) : (
                  <p className="p-4 text-sm text-slate-500">URL indisponible.</p>
                )}
              </figure>
            ))}
          </div>
        )}

        {isPending ? (
          <div className="border-t border-slate-100 pt-4">
            {actionError ? (
              <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                {actionError}
              </p>
            ) : null}

            {rejectMode ? (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">
                  Motif de refus (obligatoire)
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  autoFocus
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  placeholder="Ex : photo illisible, nom du document different du profil…"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy}
                    onClick={() => decide(false)}
                  >
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                    Confirmer le refus
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setRejectMode(false)}>
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                {row.type === 'genotype' ? (
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    Genotype retenu
                    <select
                      value={genoValue}
                      onChange={(e) => setGenoValue(e.target.value)}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                    >
                      {['AA', 'AS', 'SS'].map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => decide(true)}
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  Valider
                </button>
                <button
                  type="button"
                  className="btn-ghost !text-red-600"
                  onClick={() => setRejectMode(true)}
                  disabled={busy}
                >
                  Refuser
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="border-t border-slate-100 pt-4 text-sm text-slate-500">
            Decision deja prise le {formatDateTime(row.reviewed_at)}.
          </p>
        )}
      </div>
    </div>
  );
}
