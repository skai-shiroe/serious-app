'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Ban, ChevronLeft, ChevronRight, KeyRound, Loader2, Search, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { UserRow } from '@/lib/types';
import { PageHeader, Pill, ageFromDate } from '@/components/ui';
import BanDialog from '@/components/ban-dialog';
import { useAdmin } from '@/lib/use-admin';

const PAGE_SIZE = 25;

export default function UsersPage() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<UserRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<UserRow | null>(null);
  const [roleBusyId, setRoleBusyId] = useState<string | null>(null);
  const { user, role, permissions } = useAdmin();
  const canManageRoles = role === 'admin' || permissions.roles?.can_manage === true;

  const load = useCallback(async (q: string, from: number) => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_users_search', {
      p_query: q.trim().length > 0 ? q.trim() : null,
      p_limit: PAGE_SIZE,
      p_offset: from,
    });
    if (err) setError(err.message);
    else setRows((data ?? []) as UserRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(query, 0);
    setOffset(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    load(query, 0);
  };

  const changeRole = async (row: UserRow, nextRole: string) => {
    if (!canManageRoles || row.role === nextRole || row.user_id === user?.id) return;
    const roleLabel = nextRole === 'admin' ? 'administrateur' : nextRole === 'manager' ? 'manager' : 'utilisateur';
    if (!window.confirm(`Attribuer le rôle « ${roleLabel} » à ${row.first_name || 'cet utilisateur'} ?`)) return;

    setRoleBusyId(row.user_id);
    setError(null);
    try {
      const { error: roleError } = await supabase.rpc('admin_set_user_role', {
        p_user_id: row.user_id,
        p_role: nextRole,
      });
      if (roleError) {
        setError(`Le rôle n’a pas pu être modifié : ${roleError.message}`);
      } else {
        setRows((current) => current.map((item) => item.user_id === row.user_id ? { ...item, role: nextRole } : item));
      }
    } catch (roleError) {
      setError(`Le rôle n’a pas pu être modifié : ${roleError instanceof Error ? roleError.message : 'erreur de connexion'}`);
    } finally {
      setRoleBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Utilisateurs"
        subtitle="Recherche par nom ou ville — signalements recus, matchs et ban administratif."
      />

      {canManageRoles ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Gestion des rôles et permissions</p>
            <p className="text-xs text-slate-600">Change le rôle directement dans la liste ou règle les accès des managers.</p>
          </div>
          <Link href="/roles" className="btn-primary !py-2">
            <KeyRound size={15} /> Rôles & permissions
          </Link>
        </div>
      ) : null}

      <form onSubmit={search} className="mb-4 flex gap-2">
        <div className="relative max-w-md flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nom, prenom ou ville…"
            className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>
          Rechercher
        </button>
      </form>

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
          <p className="p-10 text-center text-sm text-slate-500">Aucun profil trouve.</p>
        ) : (
          <table className="panel-table">
            <thead>
              <tr>
                <th>Profil</th>
                <th>Ville</th>
                <th>Role</th>
                <th>Badges</th>
                <th>Signalements</th>
                <th>Matchs</th>
                <th>Etat</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.user_id} className="hover:bg-slate-50">
                  <td>
                    <p className="font-semibold">
                      {row.first_name ?? '?'} {row.last_name ?? ''}
                    </p>
                    <p className="text-xs text-slate-500">
                      {ageFromDate(row.birth_date) !== null
                        ? `${ageFromDate(row.birth_date)} ans`
                        : 'Age inconnu'}
                      {row.gender ? ` · ${row.gender}` : ''}
                    </p>
                  </td>
                  <td>{row.city ?? '—'}</td>
                  <td>
                    {canManageRoles ? (
                      <div className="flex items-center gap-2">
                        {roleBusyId === row.user_id ? <Loader2 size={15} className="animate-spin text-slate-400" /> : null}
                        <select
                          aria-label={`Rôle de ${row.first_name ?? 'l’utilisateur'}`}
                          value={row.role}
                          disabled={roleBusyId === row.user_id || row.user_id === user?.id}
                          onChange={(event) => void changeRole(row, event.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                        >
                          <option value="user">Utilisateur</option>
                          <option value="manager">Manager</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    ) : (
                      <Pill tone={row.role === 'user' ? 'slate' : 'blue'}>{row.role}</Pill>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {row.identity_verified ? <Pill tone="blue">Identite</Pill> : null}
                      {row.genotype_verified ? <Pill tone="blue">Genotype</Pill> : null}
                      {!row.identity_verified && !row.genotype_verified ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    {row.report_count > 0 ? (
                      <Pill tone={row.report_count > 2 ? 'red' : 'amber'}>{row.report_count}</Pill>
                    ) : (
                      <span className="text-xs text-slate-400">0</span>
                    )}
                  </td>
                  <td>{row.match_count}</td>
                  <td>
                    {row.banned_at ? (
                      <Pill tone="red">Banni</Pill>
                    ) : row.role !== 'user' ? (
                      <Pill tone="green">Equipe</Pill>
                    ) : (
                      <Pill tone="green">Actif</Pill>
                    )}
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      className={`btn-ghost !py-1.5 ${row.banned_at ? '!text-emerald-600' : '!text-red-600'}`}
                      disabled={row.role !== 'user'}
                      title={
                        row.role !== 'user'
                          ? 'Impossible de bannir un administrateur'
                          : row.banned_at
                            ? 'Debannir'
                            : 'Bannir'
                      }
                      onClick={() => setBanTarget(row)}
                    >
                      {row.banned_at ? <ShieldCheck size={15} /> : <Ban size={15} />}
                      {row.banned_at ? 'Debannir' : 'Bannir'}
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
              load(query, next);
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
              load(query, next);
            }}
          >
            Suivant <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {banTarget ? (
        <BanDialog
          userId={banTarget.user_id}
          userName={`${banTarget.first_name ?? ''} ${banTarget.last_name ?? ''}`.trim() || 'Profil'}
          banned={Boolean(banTarget.banned_at)}
          bannedReason={banTarget.banned_reason}
          onClose={() => setBanTarget(null)}
          onDone={() => load(query, offset)}
        />
      ) : null}
    </div>
  );
}

