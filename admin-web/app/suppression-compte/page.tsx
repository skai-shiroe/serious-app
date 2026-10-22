export const metadata = {
  title: 'Suppression du compte — Geno',
  description: 'Demander la suppression d’un compte Geno et des données associées.',
};

export default function AccountDeletionPage() {
  return (
    <main className="min-h-screen bg-[#f7f7fb] px-5 py-12 text-slate-900 sm:px-8">
      <article className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
        <span className="text-sm font-extrabold tracking-tight text-rose-600">Geno</span>
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-rose-600">Données personnelles</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Supprimer votre compte Geno</h1>
        <p className="mt-4 leading-7 text-slate-600">
          Vous pouvez demander la suppression de votre compte et des données qui lui sont associées, même si vous n’avez plus accès à l’application.
        </p>

        <section className="mt-8 rounded-2xl bg-rose-50 p-5">
          <h2 className="text-lg font-bold">Envoyer une demande</h2>
          <p className="mt-2 leading-6 text-slate-700">
            Écrivez à l’équipe Geno depuis l’adresse e-mail liée à votre compte. Indiquez que vous demandez la suppression de votre compte Geno.
          </p>
          <a
            href="mailto:privacy@geno.app?subject=Demande%20de%20suppression%20du%20compte%20Geno"
            className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-rose-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-rose-700"
          >
            Écrire à privacy@geno.app
          </a>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            N’envoyez jamais votre mot de passe. Si vous écrivez depuis une autre adresse, précisez l’adresse du compte afin que nous puissions vérifier la demande.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-lg font-bold">Depuis l’application</h2>
          <p className="leading-6 text-slate-600">
            Si vous êtes connecté, ouvrez <strong>Profil → Sécurité et confidentialité → Suppression du compte</strong> pour lancer directement la suppression.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-lg font-bold">Données concernées</h2>
          <p className="leading-6 text-slate-600">
            La suppression vise le profil, les photos, les fichiers de vérification, les likes, les matchs, les messages et les autres données liées au compte, sous réserve des données que Geno doit conserver pour respecter la loi ou traiter un incident de sécurité.
          </p>
          <p className="leading-6 text-slate-600">
            Les demandes sont vérifiées pour éviter qu’une personne ne supprime le compte de quelqu’un d’autre. Geno confirme la prise en compte de la demande par e-mail.
          </p>
        </section>

        <footer className="mt-10 border-t border-slate-100 pt-5 text-sm text-slate-500">
          Une question sur vos données ? <a className="font-semibold text-rose-600" href="mailto:privacy@geno.app">privacy@geno.app</a>
        </footer>
      </article>
    </main>
  );
}
