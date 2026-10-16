'use client';

import { useState } from 'react';
import { Ban, Loader2, ShieldCheck, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

/**
 * Dialog ban / deban : motif obligatoire pour bannir (exige aussi par
 * la RPC admin_set_banned). Interdit cote SQL de bannir un admin, de
 * se bannir soi-meme — l erreur SQL est affichee telle quelle.
 */
export default function BanDialog({
  userId,
  userName,
  banned,
  bannedReason,
  onClose,
  onDone,
}: {
  userId: string;
  userName: string;
  banned: boolean;
  bannedReason?: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (busy) return;
    if (!banned && reason.trim().length < 3) {
      setError('Motif de ban obligatoire.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('admin_set_banned', {
      p_user: userId,
      p_banned: !banned,
      p_reason: banned ? null : reason.trim(),
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    onDone();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                banned ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}
            >
              {banned ? <ShieldCheck size={20} /> : <Ban size={20} />}
            </div>
            <div>
              <h2 className="text-lg font-bold">{banned ? 'Debannir' : 'Bannir'}</h2>
              <p className="text-sm text-slate-500">{userName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost !px-2.5" aria-label="Fermer">
            <X size={16} />
          </button>
        </div>

        {banned ? (
          <div className="mb-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-semibold">Motif actuel</p>
            <p className="mt-1">{bannedReason || '—'}</p>
            <p className="mt-3 text-xs text-slate-500">
              Le compte redevient visible dans le deck des autres membres.
            </p>
          </div>
        ) : (
          <div className="mb-4 space-y-2">
            <p className="text-sm text-slate-600">
              Le profil disparait du deck, le compte reste connecte. Motif obligatoire (trace dans
              le panneau).
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="Ex : harcèlement signalement, profil frauduleux…"
            />
          </div>
        )}

        {error ? (
          <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button
            type="button"
            className={banned ? 'btn-primary' : 'btn-primary !bg-red-600 hover:!bg-red-700'}
            onClick={confirm}
            disabled={busy}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
            {banned ? 'Debannir' : 'Bannir'}
          </button>
        </div>
      </div>
    </div>
  );
}
