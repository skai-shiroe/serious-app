'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, Search, Shield, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PageHeader, Pill } from '@/components/ui';

type Member = { user_id: string; email: string | null; first_name: string | null; last_name: string | null; role: string; created_at: string };
type Access = { role: string; module: string; can_view: boolean; can_manage: boolean };
const MODULES = [
  ['dashboard','Vue d’ensemble'],['verifications','Vérifications'],['reports','Signalements'],
  ['users','Utilisateurs'],['coaching','Articles coaching'],['references','Référentiels'],
  ['notifications','Journal push'],['audit','Journal admin'],
] as const;

export default function RolesPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [access, setAccess] = useState<Access[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true); setError(null);
    const [users, perms] = await Promise.all([
      supabase.rpc('admin_users_roles', { p_query: q.trim() || null, p_limit: 100, p_offset: 0 }),
      supabase.rpc('admin_manager_permissions'),
    ]);
    if (users.error) setError(users.error.message); else setMembers((users.data ?? []) as Member[]);
    if (perms.error) setError(perms.error.message); else setAccess((perms.data ?? []) as Access[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(''); }, [load]);

  const changeRole = async (member: Member, role: string) => {
    setBusy(member.user_id); setError(null);
    const { error: err } = await supabase.rpc('admin_set_user_role', { p_user_id: member.user_id, p_role: role });
    if (err) setError(err.message);
    else setMembers((old) => old.map((row) => row.user_id === member.user_id ? { ...row, role } : row));
    setBusy(null);
  };
  const changePermission = async (module: string, field: 'can_view' | 'can_manage', value: boolean) => {
    const current = access.find((row) => row.role === 'manager' && row.module === module);
    const canManage = field === 'can_manage' ? value : (value ? (current?.can_manage ?? false) : false);
    const canView = field === 'can_view' ? value : (current?.can_view ?? false);
    setBusy(`permission:${module}`); setError(null);
    const { error: err } = await supabase.rpc('admin_set_manager_permission', { p_module: module, p_can_view: canView || canManage, p_can_manage: canManage });
    if (err) setError(err.message);
    else setAccess((old) => old.map((row) => row.role === 'manager' && row.module === module ? { ...row, can_view: canView || canManage, can_manage: canManage } : row));
    setBusy(null);
  };

  return <div>
    <PageHeader title="Rôles & permissions" subtitle="Attribue les rôles et règle les accès des managers par section. Les admins gardent l’accès complet." />
    {error ? <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

    <section className="panel-card mb-6">
      <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-brand-50 p-2.5 text-brand-700"><Users size={20}/></div><div><h2 className="font-bold">Comptes et rôles</h2><p className="text-sm text-slate-500">Les changements sont réservés à un administrateur et enregistrés dans l’audit.</p></div></div>
      <form className="mb-4 flex gap-2" onSubmit={(event) => {event.preventDefault(); void load(query);}}>
        <div className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher par e-mail ou nom" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-400"/></div>
        <button className="btn-ghost" type="submit">Rechercher</button>
      </form>
      <div className="overflow-x-auto"><table className="panel-table"><thead><tr><th>Membre</th><th>Rôle</th><th>Inscription</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={3}><div className="flex justify-center gap-2 py-8 text-sm text-slate-500"><Loader2 size={16} className="animate-spin"/>Chargement…</div></td></tr> : members.map((member) => <tr key={member.user_id}>
          <td><p className="font-semibold">{[member.first_name,member.last_name].filter(Boolean).join(' ') || 'Membre'}</p><p className="text-xs text-slate-500">{member.email}</p></td>
          <td><div className="flex items-center gap-2">{busy === member.user_id ? <Loader2 size={15} className="animate-spin text-slate-400"/> : null}<select value={member.role} onChange={(e) => void changeRole(member,e.target.value)} disabled={busy === member.user_id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium"><option value="user">Utilisateur</option><option value="manager">Manager</option><option value="admin">Administrateur</option></select><Pill tone={member.role === 'admin' ? 'blue' : member.role === 'manager' ? 'amber' : 'slate'}>{member.role}</Pill></div></td>
          <td>{new Date(member.created_at).toLocaleDateString('fr-FR')}</td>
        </tr>)}
      </tbody></table></div>
      <p className="mt-3 text-xs text-slate-500">Pour éviter de te verrouiller, ton propre rôle ne peut pas être modifié depuis cette page. Le dernier administrateur ne peut pas être retiré.</p>
    </section>

    <section className="panel-card">
      <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-violet-50 p-2.5 text-violet-700"><KeyRound size={20}/></div><div><h2 className="font-bold">Accès du rôle Manager</h2><p className="text-sm text-slate-500">Les droits d’administration sont toujours complets. Choisis ce que les managers peuvent consulter ou modifier.</p></div></div>
      <div className="overflow-x-auto"><table className="panel-table"><thead><tr><th>Section</th><th className="text-center">Consulter</th><th className="text-center">Modifier</th></tr></thead><tbody>
        {MODULES.map(([module,label]) => {
          const row = access.find((entry) => entry.role === 'manager' && entry.module === module);
          return <tr key={module}><td className="font-semibold">{label}</td><td className="text-center"><input type="checkbox" aria-label={`Manager peut consulter ${label}`} checked={row?.can_view ?? false} disabled={busy === `permission:${module}`} onChange={(e) => void changePermission(module,'can_view',e.target.checked)} className="h-4 w-4 accent-rose-600"/></td><td className="text-center"><input type="checkbox" aria-label={`Manager peut modifier ${label}`} checked={row?.can_manage ?? false} disabled={!row?.can_view || busy === `permission:${module}`} onChange={(e) => void changePermission(module,'can_manage',e.target.checked)} className="h-4 w-4 accent-rose-600"/></td></tr>;
        })}
      </tbody></table></div>
      <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><Shield size={15} className="mt-0.5 shrink-0 text-emerald-600"/>Les changements de rôle et d’accès passent par des fonctions SQL contrôlées. Les modules sensibles « Rôles » et « Configuration » restent réservés aux admins.</div>
    </section>
  </div>;
}
