'use client';

import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Power, Save, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { CityRow, CountryRow, InterestRow } from '@/lib/types';
import { PageHeader, Pill } from '@/components/ui';

/**
 * Referentiels dynamiques (bloc 11) : interets, pays, villes.
 * Lecture directe des tables ; ecriture filtree par RLS (is_admin()).
 * Suppression DOUCE partout (is_active) pour ne pas casser les profils.
 */

type Tab = 'interets' | 'pays';

const inputCls =
  'rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500';

function IconBtn({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export default function ReferentielsPage() {
  const [tab, setTab] = useState<Tab>('interets');

  return (
    <div>
      <PageHeader
        title="Référentiels"
        subtitle="Listes dynamiques de l'app (bloc 11) : intérêts, pays et villes."
      />
      <div className="mb-6 flex gap-2">
        {(
          [
            ['interets', 'Intérêts'],
            ['pays', 'Pays & villes'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              tab === key
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'interets' ? <InterestsPanel /> : <PlacesPanel />}
    </div>
  );
}

function InterestsPanel() {
  const [rows, setRows] = useState<InterestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('interests')
      .select('id, label, is_active, sort_order')
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true });
    setRows(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async () => {
    const label = newLabel.trim();
    if (!label) return;
    setError(null);
    const { error: err } = await supabase
      .from('interests')
      .insert({ label, sort_order: (rows.at(-1)?.sort_order ?? 0) + 10 });
    if (err) {
      setError(err.code === '23505' ? `« ${label} » existe déjà.` : err.message);
      return;
    }
    setNewLabel('');
    load();
  };

  const saveRename = async (row: InterestRow) => {
    const label = editLabel.trim();
    if (!label || label === row.label) {
      setEditingId(null);
      return;
    }
    setError(null);
    const { error: err } = await supabase.from('interests').update({ label }).eq('id', row.id);
    if (err) {
      setError(err.code === '23505' ? `« ${label} » existe déjà.` : err.message);
      return;
    }
    setEditingId(null);
    load();
  };

  const toggle = async (row: InterestRow) => {
    await supabase.from('interests').update({ is_active: !row.is_active }).eq('id', row.id);
    load();
  };

  const move = async (index: number, delta: number) => {
    const j = index + delta;
    if (j < 0 || j >= rows.length) return;
    const a = rows[index];
    const b = rows[j];
    await Promise.all([
      supabase.from('interests').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('interests').update({ sort_order: a.sort_order }).eq('id', b.id),
    ]);
    load();
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex gap-2">
        <input
          className={`flex-1 ${inputCls}`}
          placeholder="Nouvel intérêt (ex. Vélo)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          <Plus size={16} /> Ajouter
        </button>
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <p className="mb-3 text-xs text-slate-500">
        Un intérêt désactivé n&apos;est plus proposé à la création de profil, mais reste affiché sur
        les profils qui l&apos;ont déjà choisi. Renommer ne s&apos;applique pas rétroactivement.
      </p>
      {loading ? (
        <Loader2 className="animate-spin text-slate-400" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          {rows.map((row, index) => (
            <div
              key={row.id}
              className="flex items-center gap-2 border-b border-slate-100 bg-white px-4 py-2.5 last:border-b-0"
            >
              {editingId === row.id ? (
                <>
                  <input
                    className={`flex-1 ${inputCls}`}
                    value={editLabel}
                    autoFocus
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveRename(row)}
                  />
                  <IconBtn title="Enregistrer" onClick={() => saveRename(row)}>
                    <Save size={15} />
                  </IconBtn>
                  <IconBtn title="Annuler" onClick={() => setEditingId(null)}>
                    <X size={15} />
                  </IconBtn>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium">{row.label}</span>
                  <Pill tone={row.is_active ? 'green' : 'slate'}>
                    {row.is_active ? 'Actif' : 'Inactif'}
                  </Pill>
                  <IconBtn title="Remonter" disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp size={15} />
                  </IconBtn>
                  <IconBtn
                    title="Descendre"
                    disabled={index === rows.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={15} />
                  </IconBtn>
                  <IconBtn
                    title={row.is_active ? 'Désactiver' : 'Activer'}
                    onClick={() => toggle(row)}
                  >
                    <Power size={15} />
                  </IconBtn>
                  <IconBtn
                    title="Renommer"
                    onClick={() => {
                      setEditingId(row.id);
                      setEditLabel(row.label);
                    }}
                  >
                    <Pencil size={15} />
                  </IconBtn>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlacesPanel() {
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [cities, setCities] = useState<CityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCountry, setActiveCountry] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', dial_code: '', flag: '', min_digits: 8, max_digits: 10 });
  const [newCountry, setNewCountry] = useState({ code: '', name: '', dial_code: '' });
  const [newCity, setNewCity] = useState('');

  const loadCountries = async () => {
    const { data } = await supabase
      .from('countries')
      .select('code, name, dial_code, flag, min_digits, max_digits, is_active, sort_order')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    const list = data ?? [];
    setCountries(list);
    setActiveCountry((prev) => prev ?? list[0]?.code ?? null);
    return list;
  };

  const loadCities = async (code: string | null) => {
    if (!code) {
      setCities([]);
      return;
    }
    const { data } = await supabase
      .from('cities')
      .select('id, country_code, name, is_active')
      .eq('country_code', code)
      .order('name', { ascending: true });
    setCities(data ?? []);
  };

  useEffect(() => {
    (async () => {
      const list = await loadCountries();
      await loadCities(list[0]?.code ?? null);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectCountry = async (code: string) => {
    setActiveCountry(code);
    await loadCities(code);
  };

  const toggleCountry = async (row: CountryRow) => {
    await supabase.from('countries').update({ is_active: !row.is_active }).eq('code', row.code);
    loadCountries();
  };

  const saveCountry = async (code: string) => {
    setError(null);
    const { error: err } = await supabase
      .from('countries')
      .update({
        name: draft.name.trim(),
        dial_code: draft.dial_code.trim(),
        flag: draft.flag.trim() || '🏳️',
        min_digits: Math.max(1, Number(draft.min_digits) || 8),
        max_digits: Math.max(1, Number(draft.max_digits) || 10),
      })
      .eq('code', code);
    if (err) {
      setError(err.message);
      return;
    }
    setEditingCode(null);
    loadCountries();
  };

  const addCountry = async () => {
    const code = newCountry.code.trim().toUpperCase();
    const name = newCountry.name.trim();
    const dial = newCountry.dial_code.trim();
    if (!code || !name || !dial.startsWith('+')) {
      setError('Pays : code (2 lettres), nom et indicatif (+…) obligatoires.');
      return;
    }
    setError(null);
    const { error: err } = await supabase.from('countries').insert({
      code,
      name,
      dial_code: dial,
      flag: '🏳️',
      min_digits: 8,
      max_digits: 10,
      sort_order: (countries.at(-1)?.sort_order ?? 0) + 10,
    });
    if (err) {
      setError(err.code === '23505' ? `Le pays « ${code} » existe déjà.` : err.message);
      return;
    }
    setNewCountry({ code: '', name: '', dial_code: '' });
    const list = await loadCountries();
    selectCountry(list[list.length - 1]?.code ?? null);
  };

  const addCity = async () => {
    const name = newCity.trim();
    if (!name || !activeCountry) return;
    setError(null);
    const { error: err } = await supabase
      .from('cities')
      .insert({ country_code: activeCountry, name });
    if (err) {
      setError(err.code === '23505' ? `« ${name} » existe déjà dans ce pays.` : err.message);
      return;
    }
    setNewCity('');
    loadCities(activeCountry);
  };

  const toggleCity = async (row: CityRow) => {
    await supabase.from('cities').update({ is_active: !row.is_active }).eq('id', row.id);
    loadCities(activeCountry);
  };

  const deleteCity = async (row: CityRow) => {
    if (
      !window.confirm(
        `Supprimer définitivement « ${row.name} » des suggestions ? Les profils qui l'utilisent gardent leur valeur.`
      )
    ) {
      return;
    }
    await supabase.from('cities').delete().eq('id', row.id);
    loadCities(activeCountry);
  };

  if (loading) return <Loader2 className="animate-spin text-slate-400" />;

  const activeCountryName = countries.find((c) => c.code === activeCountry)?.name ?? '';

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <h2 className="mb-3 text-sm font-bold text-slate-700">Pays (drapeau + indicatif)</h2>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            className={`w-20 uppercase ${inputCls}`}
            placeholder="BF"
            value={newCountry.code}
            onChange={(e) => setNewCountry({ ...newCountry, code: e.target.value })}
          />
          <input
            className={`min-w-32 flex-1 ${inputCls}`}
            placeholder="Burkina Faso"
            value={newCountry.name}
            onChange={(e) => setNewCountry({ ...newCountry, name: e.target.value })}
          />
          <input
            className={`w-24 ${inputCls}`}
            placeholder="+226"
            value={newCountry.dial_code}
            onChange={(e) => setNewCountry({ ...newCountry, dial_code: e.target.value })}
          />
          <button
            type="button"
            onClick={addCountry}
            className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            <Plus size={16} /> Ajouter
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Désactiver un pays le retire du sélecteur ; impossible de le supprimer (des profils peuvent
          le référencer).
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          {countries.map((row) => (
            <div key={row.code} className="border-b border-slate-100 bg-white last:border-b-0">
              {editingCode === row.code ? (
                <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <input
                    className={`w-16 text-center ${inputCls}`}
                    value={draft.flag}
                    onChange={(e) => setDraft({ ...draft, flag: e.target.value })}
                  />
                  <input
                    className={`min-w-28 flex-1 ${inputCls}`}
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                  <input
                    className={`w-24 ${inputCls}`}
                    value={draft.dial_code}
                    onChange={(e) => setDraft({ ...draft, dial_code: e.target.value })}
                  />
                  <input
                    type="number"
                    title="Nombre min. de chiffres"
                    className={`w-16 ${inputCls}`}
                    value={draft.min_digits}
                    onChange={(e) => setDraft({ ...draft, min_digits: Number(e.target.value) })}
                  />
                  <input
                    type="number"
                    title="Nombre max. de chiffres"
                    className={`w-16 ${inputCls}`}
                    value={draft.max_digits}
                    onChange={(e) => setDraft({ ...draft, max_digits: Number(e.target.value) })}
                  />
                  <IconBtn title="Enregistrer" onClick={() => saveCountry(row.code)}>
                    <Save size={15} />
                  </IconBtn>
                  <IconBtn title="Annuler" onClick={() => setEditingCode(null)}>
                    <X size={15} />
                  </IconBtn>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => selectCountry(row.code)}
                    className={`flex flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left text-sm transition ${
                      activeCountry === row.code
                        ? 'bg-brand-50 font-semibold text-brand-700'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-lg">{row.flag}</span>
                    <span>{row.name}</span>
                    <span className="text-slate-400">
                      {row.dial_code} · min {row.min_digits}/max {row.max_digits}
                    </span>
                  </button>
                  <Pill tone={row.is_active ? 'green' : 'slate'}>
                    {row.is_active ? 'Actif' : 'Inactif'}
                  </Pill>
                  <IconBtn
                    title={row.is_active ? 'Désactiver' : 'Activer'}
                    onClick={() => toggleCountry(row)}
                  >
                    <Power size={15} />
                  </IconBtn>
                  <IconBtn
                    title="Modifier"
                    onClick={() => {
                      setEditingCode(row.code);
                      setDraft({
                        name: row.name,
                        dial_code: row.dial_code,
                        flag: row.flag,
                        min_digits: row.min_digits,
                        max_digits: row.max_digits,
                      });
                    }}
                  >
                    <Pencil size={15} />
                  </IconBtn>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-bold text-slate-700">
          Villes — {activeCountryName || 'sélectionnez un pays'}
        </h2>
        <div className="mb-4 flex gap-2">
          <input
            className={`flex-1 ${inputCls}`}
            placeholder="Nouvelle ville (ex. Ouagadougou)"
            value={newCity}
            disabled={!activeCountry}
            onChange={(e) => setNewCity(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCity()}
          />
          <button
            type="button"
            onClick={addCity}
            disabled={!activeCountry}
            className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-40"
          >
            <Plus size={16} /> Ajouter
          </button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          {cities.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-2 border-b border-slate-100 bg-white px-4 py-2.5 last:border-b-0"
            >
              <span className="flex-1 text-sm font-medium">{row.name}</span>
              <Pill tone={row.is_active ? 'green' : 'slate'}>
                {row.is_active ? 'Actif' : 'Inactif'}
              </Pill>
              <IconBtn
                title={row.is_active ? 'Désactiver' : 'Activer'}
                onClick={() => toggleCity(row)}
              >
                <Power size={15} />
              </IconBtn>
              <IconBtn title="Supprimer" onClick={() => deleteCity(row)}>
                <Trash2 size={15} />
              </IconBtn>
            </div>
          ))}
          {cities.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Aucune ville.</p>
          )}
        </div>
      </div>

    </div>
  );
}




