'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
          ? 'Adresse e-mail ou mot de passe incorrect.'
          : `Connexion impossible : ${err.message}`,
      );
      setBusy(false);
      return;
    }
    router.replace('/dashboard');
  };

  return (
    <main className="min-h-screen bg-[#f7f7fb] md:grid md:grid-cols-[minmax(0,1.05fr)_minmax(440px,0.95fr)]">
      <section className="relative hidden min-h-screen overflow-hidden bg-gradient-to-br from-[#e11d48] via-[#f43f5e] to-[#ec4899] px-12 py-10 text-white md:flex md:flex-col md:justify-between xl:px-20 xl:py-14">
        <div className="pointer-events-none absolute -right-32 -top-28 h-[480px] w-[480px] rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -bottom-48 -left-40 h-[560px] w-[560px] rounded-full border border-white/10" />
        <div className="pointer-events-none absolute right-20 top-1/3 h-72 w-72 rounded-full bg-pink-300/20 blur-3xl" />

        <div className="relative flex items-center gap-4">
          <Image src="/geno-logo.png" alt="Logo Geno" width={62} height={62} priority className="rounded-2xl shadow-xl shadow-rose-950/20" />
          <div>
            <p className="text-lg font-extrabold tracking-tight">Geno</p>
            <p className="text-sm font-medium text-white/75">Espace d’administration</p>
          </div>
        </div>

        <div className="relative max-w-xl py-16">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white/90 backdrop-blur">
            <ShieldCheck size={15} /> Console sécurisée
          </div>
          <h1 className="text-4xl font-black leading-[1.1] tracking-tight xl:text-5xl">
            Bienvenue dans votre espace Geno.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/80">
            Gérez la communauté, accompagnez les membres et gardez un œil sur l’activité de la plateforme.
          </p>
        </div>

        <p className="relative text-xs font-medium text-white/65">Geno · Administration</p>
      </section>

      <section className="flex min-h-screen flex-col items-center justify-center px-5 py-8 sm:px-10">
        <div className="mb-8 flex items-center gap-3 md:hidden">
          <Image src="/geno-logo.png" alt="Logo Geno" width={52} height={52} priority className="rounded-2xl shadow-md shadow-rose-200" />
          <div>
            <p className="text-base font-extrabold tracking-tight text-slate-900">Geno</p>
            <p className="text-xs font-medium text-slate-500">Administration</p>
          </div>
        </div>

        <div className="w-full max-w-[420px]">
          <div className="mb-7">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Connexion sécurisée</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Content de vous revoir</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Connectez-vous avec votre compte administrateur Geno.
            </p>
          </div>

          <form onSubmit={onSubmit} className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:p-8">
            <div className="space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">Adresse e-mail</label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
                  placeholder="vous@exemple.com"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">Mot de passe</label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
                    placeholder="Votre mot de passe"
                  />
                  <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400 transition hover:text-slate-700" aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error ? <p role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700">{error}</p> : null}

              <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-600 to-pink-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-rose-200 transition hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60">
                <LockKeyhole size={16} />
                {busy ? 'Connexion…' : 'Se connecter'}
                {!busy ? <ArrowRight size={16} className="ml-auto" /> : null}
              </button>
            </div>
          </form>

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-white/70 p-4">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand-600" />
            <p className="text-xs leading-5 text-slate-500">
              Accès réservé aux comptes <strong className="font-semibold text-slate-700">admin</strong> et <strong className="font-semibold text-slate-700">manager</strong>. Les autres comptes seront redirigés vers une page de refus d’accès.
            </p>
          </div>
          <p className="mt-8 text-center text-[11px] font-medium tracking-wide text-slate-400">GENO ADMIN · ACCÈS PRIVÉ</p>
        </div>
      </section>
    </main>
  );
}
