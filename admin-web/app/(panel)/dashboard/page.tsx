'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, Flag, Newspaper, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AdminStats, DailyPoint } from '@/lib/types';
import { PageHeader, Pill } from '@/components/ui';

function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={`panel-card ${accent ? 'border-brand-200 bg-brand-50/40' : ''}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function QueueLink({
  href,
  label,
  count,
  icon: Icon,
}: {
  href: string;
  label: string;
  count: number;
  icon: typeof Flag;
}) {
  const urgent = count > 0;
  return (
    <Link
      href={href}
      className={`panel-card flex items-center justify-between transition hover:shadow-md ${
        urgent ? 'border-amber-300 bg-amber-50/60' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            urgent ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          <Icon size={20} />
        </div>
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-slate-500">
            {urgent ? `${count} en attente` : 'Aucune attente'}
          </p>
        </div>
      </div>
      <ArrowRight size={18} className="text-slate-400" />
    </Link>
  );
}

const axisStyle = { fontSize: 11, fill: '#64748b' };

export default function DashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [series, setSeries] = useState<DailyPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    const [statsRes, seriesRes] = await Promise.all([
      supabase.rpc('admin_stats'),
      supabase.rpc('admin_daily_series', { p_days: 30 }),
    ]);
    if (statsRes.error) setError(statsRes.error.message);
    else setStats(statsRes.data as AdminStats);
    if (seriesRes.error) setError(seriesRes.error.message);
    else setSeries((seriesRes.data ?? []) as DailyPoint[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chartData = series.map((p) => ({
    ...p,
    label: p.day.slice(8, 10) + '/' + p.day.slice(5, 7),
  }));

  const likeRate =
    stats && stats.swipes_7d > 0
      ? `${Math.round((stats.likes_7d / stats.swipes_7d) * 100)} %`
      : '—';

  return (
    <div>
      <PageHeader
        title="Vue d’ensemble"
        subtitle="Indicateurs en temps réel — évolution sur les 7 et 30 derniers jours."
        actions={
          <button type="button" onClick={load} className="btn-ghost" disabled={loading}>
            Actualiser
          </button>
        }
      />

      {error ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Chargement impossible : {error}
        </div>
      ) : null}

      {loading && !stats ? (
        <p className="text-sm text-slate-500">Chargement des statistiques…</p>
      ) : stats ? (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Profils"
              value={stats.profiles_total}
              hint={`+${stats.profiles_7d} sur 7 j · +${stats.profiles_30d} sur 30 j`}
            />
            <KpiCard
              label="Profils verifies"
              value={stats.verified_total}
              hint="Identite et/ou genotype"
            />
            <KpiCard
              label="Matchs"
              value={stats.matches_total}
              hint={`+${stats.matches_7d} sur 7 j`}
            />
            <KpiCard
              label="Messages"
              value={stats.messages_total}
              hint={`+${stats.messages_7d} sur 7 j`}
            />
            <KpiCard
              label="Taux de like (7 j)"
              value={likeRate}
              hint={`${stats.likes_7d} likes / ${stats.swipes_7d} swipes`}
            />
            <KpiCard label="Bannis" value={stats.banned_total} hint="Bans administratifs actifs" />
            <KpiCard
              label="Verifications 30 j"
              value={stats.verifications_30d}
              hint={`${stats.verifications_pending} en attente`}
            />
            <KpiCard
              label="Coaching 30 j"
              value={stats.coaching_likes_30d}
              hint={`${stats.coaching_posts} articles · ${stats.coaching_comments_30d} com. 30 j`}
            />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <QueueLink
              href="/verifications"
              label="File des verifications"
              count={stats.verifications_pending}
              icon={ShieldCheck}
            />
            <QueueLink
              href="/signalements"
              label="File des signalements"
              count={stats.reports_pending}
              icon={Flag}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="panel-card">
              <p className="mb-4 text-sm font-semibold">Nouveaux profils (30 j)</p>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradProfiles" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={axisStyle} interval={4} />
                  <YAxis tick={axisStyle} allowDecimals={false} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="new_profiles"
                    name="Profils"
                    stroke="#e11d48"
                    fill="url(#gradProfiles)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="panel-card">
              <p className="mb-4 text-sm font-semibold">Matchs et messages (30 j)</p>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={axisStyle} interval={4} />
                  <YAxis tick={axisStyle} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="new_matches"
                    name="Matchs"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="new_messages"
                    name="Messages"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="panel-card">
              <p className="mb-4 text-sm font-semibold">Swipes et likes (30 j)</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={axisStyle} interval={4} />
                  <YAxis tick={axisStyle} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="new_swipes" name="Swipes" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="likes" name="Likes" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="panel-card">
              <p className="mb-4 text-sm font-semibold">Apercu des files</p>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <span>Verifications en attente</span>
                  <Pill tone={stats.verifications_pending ? 'amber' : 'green'}>
                    {stats.verifications_pending}
                  </Pill>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <span>Signalements en attente</span>
                  <Pill tone={stats.reports_pending ? 'amber' : 'green'}>
                    {stats.reports_pending}
                  </Pill>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <span>Signalements recus (30 j)</span>
                  <Pill tone="blue">{stats.reports_30d}</Pill>
                </div>
                <Link
                  href="/utilisateurs"
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 font-medium hover:bg-slate-100"
                >
                  <span className="flex items-center gap-2">
                    <Users size={16} /> Gerer les utilisateurs
                  </span>
                  <ArrowRight size={16} className="text-slate-400" />
                </Link>
                <Link
                  href="/articles"
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 font-medium hover:bg-slate-100"
                >
                  <span className="flex items-center gap-2">
                    <Newspaper size={16} /> Articles coaching
                  </span>
                  <ArrowRight size={16} className="text-slate-400" />
                </Link>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

