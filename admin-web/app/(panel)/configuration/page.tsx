'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Check, Loader2, Save, Settings2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/ui';

type SettingRow = { setting_key: string; label: string; description: string; value: unknown; updated_at: string | null };
const FEATURE_FLAGS = [
  { key: 'coaching', label: 'Coaching', description: 'Affiche ou masque l’onglet Coaching dans l’application.' },
  { key: 'medical_compatibility', label: 'Compatibilité médicale', description: 'Active les règles de compatibilité basées sur le génotype.' },
  { key: 'push_notifications', label: 'Notifications push', description: 'Autorise l’envoi des notifications push de l’application.' },
  { key: 'profile_verification', label: 'Vérification des profils', description: 'Affiche les options de vérification sur les profils.' },
] as const;

export default function ConfigurationPage() {
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [selected, setSelected] = useState<SettingRow | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error: err } = await supabase.from('admin_app_settings').select('*').order('label');
    if (err) setError(err.message);
    else {
      const settings = (data ?? []) as SettingRow[];
      setRows(settings);
      if (selected) {
        const next = settings.find((row) => row.setting_key === selected.setting_key) ?? null;
        setSelected(next);
        setDraft(next ? JSON.stringify(next.value, null, 2) : '');
      } else if (settings[0]) {
        setSelected(settings[0]);
        setDraft(JSON.stringify(settings[0].value, null, 2));
      }
    }
    setLoading(false);
  };
  useEffect(() => { void load(); /* initial load only */ }, []);

  const choose = (row: SettingRow) => {
    setSelected(row);
    setDraft(JSON.stringify(row.value, null, 2));
    setError(null);
    setSaved(false);
  };
  const save = async () => {
    if (!selected) return;
    let value: unknown;
    try { value = JSON.parse(draft); }
    catch { setError('Le JSON n’est pas valide. Corrige la syntaxe avant d’enregistrer.'); return; }
    setSaving(true); setError(null); setSaved(false);
    const { error: err } = await supabase.rpc('admin_settings_update', { p_key: selected.setting_key, p_value: value });
    if (err) setError(err.message);
    else {
      setSaved(true);
      setRows((current) => current.map((row) => row.setting_key === selected.setting_key ? { ...row, value } : row));
      setSelected({ ...selected, value });
    }
    setSaving(false);
  };
  const toggleFeature = (key: string, enabled: boolean) => {
    let current: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(draft);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) current = parsed as Record<string, unknown>;
    } catch { /* Le JSON brut reste visible et peut être corrigé avant d’utiliser les interrupteurs. */ }
    setDraft(JSON.stringify({ ...current, [key]: enabled }, null, 2));
    setSaved(false);
    setError(null);
  };
  const currentFlags = (() => {
    try {
      const parsed: unknown = JSON.parse(draft);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch { return {}; }
  })();

  return <div>
    <PageHeader title="Configuration de Geno" subtitle="Modifie les listes et contenus utilisés par l’application. Chaque sauvegarde est journalisée." />
    <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="panel-card !p-2">
        <p className="px-3 pb-2 pt-2 text-xs font-bold uppercase tracking-wider text-slate-400">Réglages disponibles</p>
        {loading ? <div className="flex items-center gap-2 p-4 text-sm text-slate-500"><Loader2 size={16} className="animate-spin"/>Chargement…</div> :
          rows.map((row) => <button key={row.setting_key} onClick={() => choose(row)} className={`mb-1 flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition ${selected?.setting_key === row.setting_key ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-50'}`}>
            <Settings2 size={17} className="mt-0.5 shrink-0"/><span><span className="block text-sm font-semibold">{row.label}</span><span className="mt-1 block text-xs text-slate-500">{row.description}</span></span>
          </button>)}
      </aside>
      <section className="panel-card">
        {selected ? <>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-lg font-bold text-slate-900">{selected.label}</h2><p className="mt-1 text-sm text-slate-500">{selected.description}</p></div>
            <button type="button" className="btn-primary" onClick={save} disabled={saving}><Save size={15}/>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
          {error ? <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700"><AlertCircle size={16} className="mt-0.5 shrink-0"/>{error}</div> : null}
          {saved ? <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700"><Check size={16}/>Modifications enregistrées et ajoutées au journal admin.</div> : null}
          {selected.setting_key === 'feature_flags' ? <section className="mb-5 space-y-3" aria-label="Activation des fonctionnalités">
            {FEATURE_FLAGS.map((feature) => {
              const enabled = currentFlags[feature.key] !== false;
              return <div key={feature.key} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 px-4 py-3">
                <div><p className="font-semibold text-slate-800">{feature.label}</p><p className="mt-1 text-sm text-slate-500">{feature.description}</p></div>
                <button type="button" role="switch" aria-checked={enabled} aria-label={`${enabled ? 'Désactiver' : 'Activer'} ${feature.label}`} onClick={() => toggleFeature(feature.key, !enabled)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? 'left-6' : 'left-1'}`} />
                </button>
              </div>;
            })}
            <p className="text-xs text-slate-500">Les changements prennent effet après avoir cliqué sur « Enregistrer ». L’application se met ensuite à jour automatiquement.</p>
          </section> : null}
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">{selected.setting_key === 'feature_flags' ? 'Configuration avancée (JSON)' : 'Valeur JSON'}</label>
          <textarea value={draft} onChange={(event) => {setDraft(event.target.value);setSaved(false);}} spellCheck={false} rows={24} className="w-full rounded-2xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-6 text-emerald-100 outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100" aria-label={`Valeur JSON de ${selected.label}`}/>
          <p className="mt-3 text-xs text-slate-500">Format JSON. Les changements sont appliqués aux écrans qui lisent ce réglage; les champs sont conservés comme données structurées.</p>
        </> : <p className="p-8 text-sm text-slate-500">Aucun réglage trouvé.</p>}
      </section>
    </div>
  </div>;
}
