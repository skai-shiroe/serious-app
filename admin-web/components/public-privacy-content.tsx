'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type Section = { heading: string; paragraphs: string[] };

const FALLBACK: Section[] = [
  { heading: '1. Responsable de traitement', paragraphs: ['Le responsable du traitement est Geno Togo. Contact confidentialité : privacy@geno.app.'] },
  { heading: '2. Données collectées', paragraphs: [
    'Compte : adresse e-mail, identifiant unique et données nécessaires à l’authentification.',
    'Profil : prénom, âge, ville, bio, centres d’intérêt, photos et informations de compatibilité renseignées volontairement, comme le groupe sanguin et le statut vis-à-vis de la drépanocytose. Les photos de profil sont visibles aux utilisateurs auxquels Geno les propose et toute personne disposant de leur lien public peut également les consulter.',
    'Utilisation : matchs, likes, messages, signalements, blocages et interactions avec le coaching.',
    'Technique : identifiants de notification push et journaux de connexion. Geno ne collecte pas de localisation GPS précise ; la ville est renseignée par l’utilisateur.',
  ] },
  { heading: '3. Finalités', paragraphs: [
    'Fournir le service de rencontres, assurer la sécurité et la modération, envoyer les notifications demandées et améliorer l’expérience.',
    'Les marqueurs de santé déclarés servent à appliquer les règles de compatibilité aux propositions. Ils ne sont pas renvoyés dans les profils de découverte ou les likes reçus ; ils ne deviennent visibles à l’autre personne qu’après un match réciproque, si vous avez choisi de les renseigner.',
  ] },
  { heading: '4. Base légale', paragraphs: ['Le service traite les données nécessaires à l’utilisation du compte et s’appuie sur votre choix lorsque vous renseignez des données de compatibilité ou activez les notifications. Les données nécessaires à la sécurité et à la modération sont utilisées pour protéger la communauté.'] },
  { heading: '5. Partage et hébergement', paragraphs: [
    'Les données sont hébergées par Supabase. Les notifications push transitent par les services Apple (APNs) et Google (FCM).',
    'Geno ne vend ni ne loue les données personnelles à des tiers à des fins publicitaires.',
  ] },
  { heading: '6. Conservation', paragraphs: [
    'Les données du compte sont conservées pendant son utilisation puis supprimées avec la demande de suppression, sauf obligation légale de conservation.',
    'Les justificatifs de vérification sont conservés dans un espace privé jusqu’à la suppression du compte, sauf obligation légale. La durée de conservation des journaux techniques dépend de leur finalité et des règles du fournisseur d’hébergement.',
  ] },
  { heading: '7. Sécurité', paragraphs: [
    'Les accès à la base sont protégés par des règles Row Level Security ; les échanges utilisent TLS et les clés privilégiées ne sont jamais embarquées dans l’application.',
    'Les justificatifs de vérification sont stockés dans un espace privé et accessibles aux personnes habilitées à traiter les demandes. Ils sont supprimés lors de la suppression du compte.',
  ] },
  { heading: '8. Vos droits', paragraphs: [
    'Vous pouvez demander l’accès, la rectification, l’effacement, la limitation ou la portabilité de vos données, et vous opposer à certains traitements. La suppression peut être lancée dans Profil → Sécurité et confidentialité ou depuis la page de suppression de compte.',
    'Contact : privacy@geno.app. Vous pouvez également saisir l’autorité de protection des données compétente, notamment l’IPDCP au Togo ou la CNIL en France.',
  ] },
  { heading: '9. Contact', paragraphs: ['Pour toute question relative à la confidentialité : privacy@geno.app.'] },
];

export default function PublicPrivacyContent() {
  const [sections, setSections] = useState(FALLBACK);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return;

    const client = createClient(url, anonKey);
    let active = true;
    void (async () => {
      try {
        const { data } = await client.from('admin_app_settings').select('value').eq('setting_key', 'legal_content').maybeSingle();
        const remote = data?.value && typeof data.value === 'object'
          ? (data.value as Record<string, unknown>).privacy
          : null;
        if (active && Array.isArray(remote) && remote.length > 0) setSections(remote as Section[]);
      } catch {
        // The bundled privacy text remains available if the public settings API is unavailable.
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <main className="min-h-screen bg-[#f7f7fb] px-5 py-12 text-slate-900 sm:px-8">
      <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
        <p className="text-sm font-extrabold tracking-tight text-rose-600">Geno</p>
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-rose-600">Données personnelles · mise à jour le 22 octobre 2026</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Politique de confidentialité</h1>
        <p className="mt-4 leading-7 text-slate-600">Cette page explique quelles données Geno utilise, pourquoi elles sont traitées, comment elles sont protégées et comment demander leur suppression.</p>

        <div className="mt-8 space-y-7">
          {sections.map((section, index) => (
            <section key={`${section.heading}-${index}`} className="border-t border-slate-100 pt-6">
              <h2 className="text-lg font-bold">{section.heading}</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-slate-600">
                {section.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
              </div>
            </section>
          ))}
        </div>

        <a href="/suppression-compte" className="mt-9 inline-flex rounded-xl bg-rose-600 px-5 py-3 text-sm font-bold text-white hover:bg-rose-700">
          Demander la suppression de mon compte
        </a>
      </article>
    </main>
  );
}
