'use client';

import { useEffect, useState } from 'react';
import { ImagePlus, Loader2, Save, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { CoachingCategory, CoachingPost } from '@/lib/types';

/**
 * Creation / edition d un article coaching. Image : fichier vers le
 * bucket public `coaching` (dossier de l admin connecte, meme
 * mecanique que app/(tabs)/coaching.tsx cote mobile), ou URL libre.
 */
export default function CoachingForm({
  existing,
  adminUserId,
  onClose,
  onSaved,
}: {
  existing: CoachingPost | null;
  adminUserId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [content, setContent] = useState(existing?.content ?? '');
  const [category, setCategory] = useState<CoachingCategory>(existing?.category ?? 'couple');
  const [categories, setCategories] = useState<{ value: string; label: string }[]>([
    { value: 'couple', label: 'Couple' }, { value: 'santé', label: 'Santé' }, { value: 'astuce', label: 'Astuce' },
  ]);
  const [imageUrl, setImageUrl] = useState(existing?.image_url ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase.rpc('app_public_setting', { p_key: 'coaching_categories' }).then(({ data }) => {
      if (Array.isArray(data) && data.length) {
        const next = data.filter((item: any) => item.value && item.label);
        setCategories(next);
        if (!next.some((item: any) => item.value === category)) setCategory(next[0].value);
      }
    });
  }, []);

  const save = async () => {
    if (busy) return;
    if (title.trim().length < 3 || content.trim().length < 10) {
      setError('Titre (3 car. min) et contenu (10 car. min) obligatoires.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let finalUrl = imageUrl.trim();

      if (file) {
        const path = `${adminUserId}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
        const { error: upErr } = await supabase.storage
          .from('coaching')
          .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
        if (upErr) throw new Error(`Upload image : ${upErr.message}`);
        const { data } = supabase.storage.from('coaching').getPublicUrl(path);
        finalUrl = data.publicUrl;
      }

      const payload = {
        title: title.trim(),
        content: content.trim(),
        category,
        image_url: finalUrl || null,
      };

      if (existing) {
        const { error: upErr } = await supabase
          .from('coaching_posts')
          .update(payload)
          .eq('id', existing.id);
        if (upErr) throw new Error(upErr.message);
      } else {
        const { error: insErr } = await supabase
          .from('coaching_posts')
          .insert({ ...payload, user_id: adminUserId });
        if (insErr) throw new Error(insErr.message);
      }

      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold">
            {existing ? 'Modifier l article' : 'Nouvel article'}
          </h2>
          <button type="button" onClick={onClose} className="btn-ghost !px-2.5" aria-label="Fermer">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="post-title" className="mb-1 block text-sm font-medium text-slate-700">
              Titre
            </label>
            <input
              id="post-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="Ex : Parler du drépanocytose en couple"
            />
          </div>

          <div>
            <label htmlFor="post-cat" className="mb-1 block text-sm font-medium text-slate-700">
              Categorie
            </label>
            <select
              id="post-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value as CoachingCategory)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="post-content" className="mb-1 block text-sm font-medium text-slate-700">
              Contenu
            </label>
            <textarea
              id="post-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="Conseil complet, structure en paragraphes…"
            />
          </div>

          <div>
            <label htmlFor="post-image" className="mb-1 block text-sm font-medium text-slate-700">
              Image (fichier) ou URL existante
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="btn-ghost cursor-pointer">
                <ImagePlus size={16} />
                {file ? file.name.slice(0, 28) : 'Choisir un fichier'}
                <input
                  id="post-image"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://… (URL optionnelle)"
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
            {file ? (
              <p className="mt-1 text-xs text-slate-500">
                Le fichier remplace l URL ci-dessus a la sauvegarde.
              </p>
            ) : null}
          </div>

          {existing?.image_url && !file ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={existing.image_url} alt="" className="h-40 w-full rounded-xl object-cover" />
          ) : null}

          {error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
              Annuler
            </button>
            <button type="button" className="btn-primary" onClick={save} disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

