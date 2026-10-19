'use client';

import { useEffect, useState } from 'react';
import { Loader2, ScrollText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/ui';
type Event = { id: number; actor_id: string | null; action: string; target_type: string | null; target_id: string | null; details: Record<string,unknown>; created_at: string };
export default function AuditPage() {
  const [rows,setRows] = useState<Event[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  useEffect(() => {
    supabase.rpc('admin_audit_recent',{p_limit:250}).then(({data,error:err}) => {
      if(err) setError(err.message); else setRows((data??[]) as Event[]);
      setLoading(false);
    });
  },[]);
  return <div>
    <PageHeader title="Journal d’administration" subtitle="Historique des changements sensibles effectués depuis le dashboard."/>
    <section className="panel-card !p-0 overflow-hidden">
      {error ? <p className="p-4 text-sm text-red-700">{error}</p> : null}
      {loading ? <div className="flex justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 size={16} className="animate-spin"/>Chargement…</div> : rows.length===0 ? <div className="flex flex-col items-center p-12 text-center text-slate-500"><ScrollText size={24}/><p className="mt-3 text-sm">Aucune action enregistrée pour le moment.</p></div> :
      <div className="overflow-x-auto"><table className="panel-table"><thead><tr><th>Date</th><th>Action</th><th>Cible</th><th>Détails</th><th>Administrateur</th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.id}><td className="whitespace-nowrap">{new Date(row.created_at).toLocaleString('fr-FR')}</td><td><span className="rounded-lg bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700">{row.action}</span></td><td>{row.target_type ?? '—'} {row.target_id ? <span className="font-mono text-xs text-slate-500">{row.target_id}</span> : null}</td><td><pre className="max-w-md whitespace-pre-wrap break-all text-xs text-slate-600">{JSON.stringify(row.details,null,2)}</pre></td><td className="font-mono text-xs text-slate-500">{row.actor_id ?? 'système'}</td></tr>)}
      </tbody></table></div>}
    </section>
  </div>;
}
