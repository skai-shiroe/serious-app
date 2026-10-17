# Geno — Panneau web d administration

Dashboard Next.js (App Router, 100 % client) branche sur le **meme projet Supabase**
que l app mobile : statistiques, files de moderation (verifications, signalements),
gestion des utilisateurs (ban admin), articles coaching et journal push.

## Prérequis

1. **SQL** : coller `../sql/admin-panel.sql` (bloc 10) dans Supabase → SQL Editor.
   Idempotent, re-executable. Il cree :
   - `profiles.banned_at` / `banned_reason` + `created_at` (si absent) ;
   - `admin_set_banned()`, `admin_stats()`, `admin_daily_series()`,
     `admin_verifications_queue()`, `admin_reports_queue()`,
     `admin_update_report()`, `admin_users_search()`, `admin_push_log()` ;
   - trigger anti-auto-unban `profiles_ban_guard` ;
   - policies admin sur `coaching_posts` / `coaching_comments` (update/delete).
2. **SQL** : coller aussi `../sql/referentiels.sql` (bloc 11) — tables
   `countries` / `cities` / `interests` alimentant la page `/referentiels` et l app
   (pays/villes/interets dynamiques).
3. Un compte Supabase avec `profiles.role` egal a `admin` ou `manager`.

## Démarrage

```bash
cd admin-web
cp .env.example .env.local      # puis remplir URL + cle anon (meme valeurs que la racine)
npm install
npm run dev                     # http://localhost:3000
```

Scripts : `npm run dev` · `npm run build` · `npm start` · `npm run typecheck`.

## Sécurité (double garde)

| Couche | Role |
|---|---|
| `lib/use-admin.ts` (hook) | Gate UI : session + `profiles.role` → sinon `/login` ou `/403`. **Purement visuel.** |
| RLS + `is_admin()` dans chaque RPC | Le vrai verrou : toutes les fonctions `admin_*` sont `security definer` et lèvent `not allowed` pour un non-admin. `anon` n a aucun droit. |
| Trigger `profiles_ban_guard` | Empeche un utilisateur de clearer son propre `banned_at` via un UPDATE de profil. |
| Bucket `verifications` | Documents en **URL signee 5 min** (policy `verif_read` existante). |

Aucune `service_role` n est utilisee : le panneau agit avec le JWT du compte admin
connecte, exactement comme l app mobile.

## Routes

- `/login` — connexion email/mot de passe
- `/dashboard` — KPI (RPC `admin_stats`), files en attente, graphiques 30 j (Recharts)
- `/verifications` — file paginee, visionneuse documents, Valider / Refuser (RPC `review_verification`)
- `/signalements` — file paginee, Traiter / Classer sans suite (RPC `admin_update_report`), ban direct
- `/utilisateurs` — recherche nom/ville, badges, signalements recus, matchs, ban/deban (RPC `admin_set_banned`)
- `/articles` — CRUD articles coaching (upload image bucket `coaching`), moderation des commentaires
- `/referentiels` — CRUD dynamique intérêts / pays / villes (bloc 11 `sql/referentiels.sql`)
- `/journal` — 100 derniers envois push (`push_log`)

## Déploiement (Vercel)

- Dossier racine du projet : `admin-web`
- Variables d environnement : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (jamais de `service_role`).

## Limites connues (v1)

- Un banni ne voit plus personne dans le deck mais reste connecte : le blocage
  total du login (exclusion a l auth) n est pas encore implemente.
- Stats en temps reel par RPC (suffisant avant ~10k comptes ; au-dela, envisager
  une table `daily_stats` alimentee par cron).
- Suppression definitive de compte = Edge Function `delete-account` existante
  (pas encore boutonnee depuis le panneau).
