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
  Settings2,
  KeyRound,
  ScrollText,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { FullScreenSpinner, useAdmin } from '@/lib/use-admin';

const NAV = [
  { href: '/dashboard', label: 'Vue d’ensemble', icon: LayoutDashboard, module: 'dashboard' },
  { href: '/verifications', label: 'Vérifications', icon: ShieldCheck, module: 'verifications' },
  { href: '/signalements', label: 'Signalements', icon: Flag, module: 'reports' },
  { href: '/utilisateurs', label: 'Utilisateurs', icon: Users, module: 'users' },
  { href: '/articles', label: 'Articles coaching', icon: Newspaper, module: 'coaching' },
  { href: '/referentiels', label: 'Référentiels', icon: ListChecks, module: 'references' },
  { href: '/journal', label: 'Journal push', icon: Bell, module: 'notifications' },
  { href: '/roles', label: 'Rôles & permissions', icon: KeyRound, module: 'roles' },
  { href: '/configuration', label: 'Configuration', icon: Settings2, module: 'settings' },
  { href: '/audit', label: 'Journal admin', icon: ScrollText, module: 'audit' },
];

function Sidebar({ email, role, permissions }: { email: string; role: string | null; permissions: Record<string, { can_view: boolean; can_manage: boolean }> }) {
  const pathname = usePathname();
  const router = useRouter();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 flex-col border-r border-slate-200/80 bg-white lg:flex">
      <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-pink-600 text-lg font-black text-white shadow-lg shadow-rose-200">
          G
        </div>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-extrabold tracking-tight">Geno <span className="font-medium text-slate-400">Admin</span></p>
          <p className="truncate text-xs text-slate-500">Console de gestion</p>
        </div>
      </div>

      <div className="px-5 pb-2 pt-6 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Espace de travail</div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-1">
        {NAV.filter(({ module }) => permissions[module]?.can_view).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-3 text-[13px] font-semibold transition ${
                active
                  ? 'bg-brand-50 text-brand-700 shadow-sm shadow-brand-100'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {active ? <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-brand-500" /> : null}
              <Icon size={18} strokeWidth={active ? 2.4 : 1.9} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-4">
        <div className="mb-3 flex min-w-0 items-center gap-3 rounded-2xl bg-slate-50 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold uppercase text-brand-700">{email.slice(0, 1) || 'A'}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-800">{email}</p><p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-brand-600">{role ?? 'Admin'}</p></div>
        </div>
        <button type="button" onClick={signOut} className="btn-ghost w-full justify-start border-transparent bg-transparent text-slate-500 hover:border-slate-200 hover:bg-white">
          <LogOut size={16} />
          Se déconnecter
        </button>
      </div>
    </aside>
  );
}

function MobileNav({ permissions }: { permissions: Record<string, { can_view: boolean; can_manage: boolean }> }) {
  const pathname = usePathname();
  const router = useRouter();
  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };
  return (
    <div className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 px-3 py-2 backdrop-blur lg:hidden">
      <div className="mb-2 flex items-center gap-2 px-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-pink-600 text-sm font-black text-white">G</div>
        <span className="flex-1 text-sm font-extrabold">Geno <span className="font-medium text-slate-400">Admin</span></span>
        <button type="button" onClick={signOut} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Se déconnecter"><LogOut size={16} /></button>
      </div>
      <nav className="flex gap-1 overflow-x-auto pb-1">
        {NAV.filter(({ module }) => permissions[module]?.can_view).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return <Link key={href} href={href} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${active ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50'}`}><Icon size={15} />{label}</Link>;
        })}
      </nav>
    </div>
  );
}

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const { loading, checked, isAdmin, user, role, permissions } = useAdmin();
  const router = useRouter();
  const pathname = usePathname();
  const routeModules: Record<string, string> = {
    '/dashboard': 'dashboard', '/verifications': 'verifications', '/signalements': 'reports',
    '/utilisateurs': 'users', '/articles': 'coaching', '/referentiels': 'references',
    '/journal': 'notifications', '/roles': 'roles', '/configuration': 'settings', '/audit': 'audit',
  };
  const module = routeModules[pathname] ?? 'dashboard';

  useEffect(() => {
    if (!checked) return;
    if (!user) router.replace('/login');
    else if (!isAdmin) router.replace('/403');
    else if (!permissions[module]?.can_view) router.replace('/403');
  }, [checked, isAdmin, user, router, permissions, module]);

  if (loading || !checked || !isAdmin || !user || !permissions[module]?.can_view) {
    return <FullScreenSpinner label="Verification des droits admin…" />;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar email={user.email ?? ''} role={role} permissions={permissions} />
      <div className="min-w-0 flex-1">
        <MobileNav permissions={permissions} />
        <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-9 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
