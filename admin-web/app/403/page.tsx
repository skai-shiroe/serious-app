'use client';

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-600">
        <ShieldAlert size={32} />
      </div>
      <h1 className="text-2xl font-bold">Acces refuse</h1>
      <p className="max-w-md text-sm text-slate-500">
        Ce compte n a pas le role <strong>admin</strong> ou <strong>manager</strong> requis pour le
        panneau d administration.
      </p>
      <Link href="/login" className="btn-ghost">
        Retour a la connexion
      </Link>
    </main>
  );
}
