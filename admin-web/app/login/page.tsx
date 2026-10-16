'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(
        err.message === 'Invalid login credentials'
          ? 'Email ou mot de passe incorrect.'
          : `Connexion impossible : ${err.message}`,
      );
      setBusy(false);
      return;
    }
    router.replace('/dashboard');
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white">
            <ShieldCheck size={28} />
          </div>
          <h1 className="text-2xl font-bold">Geno — Administration</h1>
          <p className="text-center text-sm text-slate-500">
            Espace reserve aux comptes <strong>admin</strong> et <strong>manager</strong>.
          </p>
        </div>

        <form onSubmit={onSubmit} className="panel-card space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="vous@exemple.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="••••••••"
            />
          </div>

          {error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            <Lock size={16} />
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Un compte sans role administrateur sera redirige vers /403.
        </p>
      </div>
    </main>
  );
}
