'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  Bell,
  Flag,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Newspaper,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { FullScreenSpinner, useAdmin } from '@/lib/use-admin';

const NAV = [
  { href: '/dashboard', label: 'Vue densembre', icon: LayoutDashboard },
  { href: '/verifications', label: 'Verifications', icon: ShieldCheck },
  { href: '/signalements', label: 'Signalements', icon: Flag },
  { href: '/utilisateurs', label: 'Utilisateurs', icon: Users },
  { href: '/articles', label: 'Articles coaching', icon: Newspaper },
  { href: '/referentiels', label: 'Référentiels', icon: ListChecks },
  { href: '/journal', label: 'Journal push', icon: Bell },
];

function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
          G
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">Geno Admin</p>
          <p className="truncate text-xs text-slate-500">{email}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-3">
        <button type="button" onClick={signOut} className="btn-ghost w-full">
          <LogOut size={16} />
          Deconnexion
        </button>
      </div>
    </aside>
  );
}

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const { loading, checked, isAdmin, user } = useAdmin();
  const router = useRouter();

  useEffect(() => {
    if (!checked) return;
    if (!user) router.replace('/login');
    else if (!isAdmin) router.replace('/403');
  }, [checked, isAdmin, user, router]);

  if (loading || !checked || !isAdmin || !user) {
    return <FullScreenSpinner label="Verification des droits admin…" />;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar email={user.email ?? ''} />
      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
