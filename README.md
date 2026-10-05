# Serious App 💖

Une application de rencontre moderne et engagée, conçue avec un focus particulier sur la compatibilité santé (Groupe Sanguin et Statut Drépanocytaire).

## 🚀 Fonctionnalités Principales

- **Authentification Sécurisée** : Gestion des sessions via Supabase Auth.
- **Profils Avancés** :
  - Upload de photos multiples.
  - Calcul dynamique de l'âge via la date de naissance.
  - Informations de santé intégrées (Pills visuelles).
- **Matching Immersif (Tinder-style)** :
  - Swipe Cards à 60 FPS avec `react-native-reanimated` et `gesture-handler`.
  - Gestes multicouches : Tap pour les photos/détails, Swipe pour l'action.
  - Filtres de recherche par ville, âge et critères de santé.
- **Messagerie Temps Réel** :
  - Détection instantanée des matchs mutuels (Popup de célébration).
  - Chat en direct via Supabase Realtime.
  - Indicateurs de lecture et de présence (statut "En ligne" par polling).
  - Messagerie optimisée pour les performances.

## 🏗️ Architecture Technique

- **Frontend** : [Expo SDK 54](https://expo.dev/) / [React Native](https://reactnative.dev/)
- **Navigation** : [Expo Router](https://docs.expo.dev/router/introduction/) (File-based routing)
- **Base de données / Backend** : [Supabase](https://supabase.com/)
- **Animations** : React Native Reanimated 3
- **Composants UI** :
  - `@gorhom/bottom-sheet` pour des détails de profil immersifs.
  - `expo-image` pour un cache d'images ultra-performant.
  - `lucide-react-native` pour l'iconographie.
- **Session & utilisateur courant** : `lib/session.ts` — source unique de l'utilisateur connecté,
  lue depuis la **session locale** (`getSession()`) et tenue à jour par `onAuthStateChange`.
  **Aucun appel réseau** dans la boucle swipe / message (les `auth.getUser()` revalidaient le JWT
  à chaque appel). **Une seule exception** : `validateSession()` au démarrage, qui détecte un
  compte supprimé côté Supabase et déconnecte localement — jamais sur une simple panne réseau.
- **Cache d'images** : `lib/images.ts` — `cachePolicy="memory-disk"` + préchargement partagés
  par tous les écrans (plus d'écran gris au changement de carte ou d'avatar).
- **Temps réel** : Supabase Realtime sur `messages`, `matches` et `presence` (aucun polling).
- **Requêtes bornées** : `lib/candidates.ts` — le deck « Découvrir » se charge par **pages**
  (curseur `user_id` croissant) au lieu d'exclure les profils déjà swipés via une liste
  d'identifiants dans l'URL. Ville, groupe sanguin, drépanocytose et **bornes d'âge** sont filtrés
  par la RPC, côté serveur. Aucune requête ne peut plus renvoyer la table entière :
  `coaching_posts` est plafonné à 100 lignes, l'historique d'un chat aux 200 derniers messages.
- **Création / édition de profil** : `components/profile-creation.tsx` — les photos partent **dès
  leur sélection** (en parallèle, base64 libéré aussitôt : ~20 Mo de moins en mémoire), nom de
  fichier versionné avec suppression de l'ancien (aucun orphelin dans `avatars`, aucune image
  périmée en cache), état par emplacement avec « Réessayer » ciblé. La date de naissance se saisit
  au clavier `JJ → MM → AAAA` sans avoir à toucher chaque champ.
- **Erreurs ≠ listes vides** : `components/empty-state.tsx` — un échec réseau affiche un
  message explicite avec un bouton **Réessayer**, et non « Revenez plus tard 💤 ».
- **Vérification d'identité & génotype** : `app/verification.tsx` (dépôt des pièces) et
  `app/admin/verifications.tsx` (revue admin). Documents dans le bucket **privé**
  `verifications`, lus uniquement via des URLs signées de 5 min ; validation atomique par la RPC
  `review_verification` (droits vérifiés côté serveur) ; badges sur le deck, la fiche, les
  messages et le chat.

## 🛠️ Installation & Lancement

1. **Installation des dépendances** :
   ```bash
   npm install
   ```

2. **Variables d'environnement** :
   Créez un fichier `.env` à la racine avec vos accès Supabase :
   Utilisez le modele fourni (aucun secret n'est versionne, le depot est public) :
   ```bash
   cp .env.example .env
   ```
   ```env
   EXPO_PUBLIC_SUPABASE_URL=VOTRE_URL_SUPABASE
   EXPO_PUBLIC_SUPABASE_ANON_KEY=VOTRE_CLE_ANON
   ```

   > Les variables `EXPO_PUBLIC_*` sont **publiques** : elles sont embarquees en clair dans
   > l'application. La securite des donnees repose donc **entierement sur les policies RLS**
   > de Supabase. Ne jamais placer ici de cle `service_role`.
   >
   > **Builds EAS** : `eas build` n'embarque pas `.env` (ignore par git) — les memes valeurs
   > sont stockees cote EAS, deja configurees pour `development`, `preview` et `production` :
   > ```bash
   > eas env:list --environment production
   > ```

3. **Lancement du projet** :
   Pour éviter les problèmes de validation réseau (si nécessaire) :
   ```bash
   npx expo start --offline
   ```

## 🔐 Redirect URLs (OAuth Google)

Ces URLs doivent être déclarées dans **Supabase → Authentication → URL Configuration → Redirect URLs** :

```
seriousapp://auth-callback
exp+seriousapp://auth-callback
http://localhost:8081/**
http://192.168.1.237:8081/**
http://localhost:8083/**
http://192.168.1.237:8083/**
```

Et dans **Google Cloud Console → Identifiants OAuth → Authorized redirect URIs** :

```
https://<PROJECT_REF>.supabase.co/auth/v1/callback
```

> `seriousapp://auth-callback` est l'URL utilisée par les builds natifs (dev build / production),
> `exp+seriousapp://auth-callback` par Expo Go, et les URLs `http://...` servent au développement web.

## 📲 Development Build (sans Expo Go)

```bash
# 1. Dépendance du client de développement (obligatoire)
npx expo install expo-dev-client

# 2. Build cloud de développement (APK installable)
npx eas-cli build --profile development --platform android

# 3. Installer l'APK sur l'appareil, puis lancer le bundler
npx expo start --dev-client
```

**Pré-requis push notifications (Android)** : les dev builds n'utilisent plus les credentials
FCM d'Expo Go. Il faut ajouter un **FCM Service Account Key** dans
EAS → Project → Credentials → Android, sinon les Edge Functions `notify-*` échoueront.

**Pré-requis variables d'environnement** : `.env` n'étant pas versionné, les builds cloud
reçoivent les valeurs via les variables d'environnement EAS (déjà créées pour les 3 profils) :
```bash
eas env:list --environment preview
# mise à jour d'une valeur :
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<nouvelle_cle>" \
  --environment production --environment preview --environment development \
  --visibility plaintext --force
```

## 📜 Base de Données

Le projet utilise les tables suivantes dans Supabase :
- `profiles` : Informations détaillées des membres.
- `swipes` : Historique des interactions Gauche/Droite.
- `matches` : Paires d'utilisateurs ayant matché.
- `messages` : Échanges textuels sécurisés.
- `presence` : Suivi léger de l'activité des utilisateurs.

## 🔐 Sécurité

- `.env` n'est **jamais versionné** (copier `.env.example`) : le dépôt et son historique sont publics.
- La clé `anon` est **publique par conception** (embarquée dans l'app) : la protection des
  données repose **entièrement sur les policies RLS**. Vérifié : `profiles`, `swipes`,
  `matches` et `messages` ne renvoient **aucune ligne** à un appel anonyme.
- `coaching_posts` est actuellement lisible publiquement — à confirmer si c'est voulu.
- En cas de clé compromise : **Supabase → Project Settings → API → Rotate keys**, puis mettre
  à jour `.env` et les variables EAS (voir la section Development Build).
- **Repartir de zéro pour un test** : se **déconnecter dans l'app** avant de supprimer le compte
  dans Supabase. Sinon la session reste stockée sur l'appareil (le JWT d'un compte supprimé n'est
  pas invalidé avant son expiration) : `validateSession()` la détecte au démarrage suivant et
  ramène à l'écran de connexion, mais pour un nettoyage immédiat :
  **Paramètres → Applications → serious-app → Stockage → Effacer les données**.

## 🗄️ SQL à exécuter dans Supabase

À lancer dans **Supabase → SQL Editor**. ⚠️ L'éditeur exécute le script entier dans **une seule
transaction** : une erreur en fin de script annule **aussi** toutes les instructions précédentes.
D'où 4 blocs séparés, chacun ré-exécutable sans risque (idempotent).

**Bloc 0 — état actuel (contrôle)**

```sql
select proname from pg_proc where proname in ('get_last_messages', 'get_candidate_profiles');
select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime';
```

**Bloc 1 — dernier message de chaque conversation (écran Messages)**

```sql
create or replace function get_last_messages(match_ids uuid[])
returns table (match_id uuid, content text, created_at timestamptz, sender_id uuid)
language sql stable as $$
  select distinct on (m.match_id) m.match_id, m.content, m.created_at, m.sender_id
  from messages m
  where m.match_id = any(match_ids)
  order by m.match_id, m.created_at desc;
$$;
```

**Bloc 2 — profils du deck « Découvrir »**

```sql
-- Les anciennes signatures sont retirées : sans cela, `create or replace`
-- crée une SURCHARGE (deux fonctions de noms identiques) et les appels de
-- l'app deviennent ambigus.
drop function if exists get_candidate_profiles(integer, uuid, text, text, text);
drop function if exists get_candidate_profiles(integer, uuid, text, text, text, integer, integer);

-- Exclusion des profils déjà swipés faite par PostgreSQL (jamais par une liste
-- d'identifiants dans l'URL de la requête), pagination par curseur
-- (p_after = dernier user_id parcouru), filtre d'âge ET matching strict par
-- genre côté serveur (p_gender = genre du visiteur).
create or replace function get_candidate_profiles(
  p_limit integer default 30,
  p_after uuid default null,
  p_gender text default null,
  p_city text default null,
  p_blood_type text default null,
  p_sickle_cell text default null,
  p_age_min integer default null,
  p_age_max integer default null
)
returns setof profiles
language sql stable
as $$
  select p.*
  from profiles p
  where p.user_id <> auth.uid()
    and not exists (
      select 1 from swipes s
      where s.swiper_id = auth.uid()
        and s.swiped_id = p.user_id
    )
    and (p_after is null or p.user_id > p_after)
    -- Matching strict : un profil ne voit QUE le genre opposé.
    and (p_gender is null or lower(p.gender) = lower(p_gender))
    and (p_city is null or p.city ilike '%' || p_city || '%')
    and (p_blood_type is null or p.blood_type = p_blood_type)
    and (p_sickle_cell is null or p.sickle_cell = p_sickle_cell)
    -- Âge en années révolues : équivalent exact du calculateAge de l'app.
    and (
      p.birth_date is null
      or (
        date_part('year', age(p.birth_date::date)) >= coalesce(p_age_min, 0)
        and date_part('year', age(p.birth_date::date)) <= coalesce(p_age_max, 200)
      )
    )
  order by p.user_id
  limit greatest(p_limit, 1);
$$;

revoke execute on function get_candidate_profiles(integer, uuid, text, text, text, text, integer, integer) from public;
grant execute on function get_candidate_profiles(integer, uuid, text, text, text, text, integer, integer) to authenticated;
```

**Bloc 3 — temps réel sur la présence et les matchs (idempotent)**

```sql
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public'
                   and tablename = 'presence') then
    alter publication supabase_realtime add table public.presence;
  end if;

  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public'
                   and tablename = 'matches') then
    alter publication supabase_realtime add table public.matches;
  end if;
end $$;
```

**Bloc 4 — vérification d'identité & génotype**

```sql
-- Journal des demandes (audit : qui, quand, quoi, pourquoi refuse)
create table if not exists public.verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('identity','genotype')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  documents jsonb not null default '[]'::jsonb,
  declared_value text,
  verified_value text,
  rejection_reason text,
  reviewer_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists verifications_user_idx on public.verifications (user_id, type, created_at desc);
create index if not exists verifications_pending_idx on public.verifications (status) where status = 'pending';

-- Badges denormalises : le deck les lit deja via `select *` sur profiles
alter table public.profiles
  add column if not exists identity_verified boolean not null default false,
  add column if not exists genotype_verified boolean not null default false,
  add column if not exists verified_at timestamptz;

-- Est-admin ? (security definer : evite la recursion RLS sur profiles)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where user_id = auth.uid() and role in ('admin','manager'));
$$;

alter table public.verifications enable row level security;

drop policy if exists verifications_select on public.verifications;
create policy verifications_select on public.verifications for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists verifications_insert on public.verifications;
create policy verifications_insert on public.verifications for insert
  with check (user_id = auth.uid());
-- Aucune policy UPDATE/DELETE pour l'utilisateur : pas d'auto-validation.
-- Apres un refus, il cree une NOUVELLE demande (l'historique est conserve).

-- Bucket PRIVE : une piece d'identite ne doit jamais etre publique
insert into storage.buckets (id, name, public) values ('verifications','verifications', false)
  on conflict (id) do update set public = false;

drop policy if exists verif_upload on storage.objects;
create policy verif_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'verifications'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists verif_read on storage.objects;
create policy verif_read on storage.objects for select to authenticated
  using (bucket_id = 'verifications'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Validation atomique, reservee aux admins
create or replace function public.review_verification(
  p_id uuid, p_approve boolean, p_verified_value text default null, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_type text; v_user uuid;
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;

  update public.verifications
     set status = case when p_approve then 'approved' else 'rejected' end,
         verified_value = p_verified_value,
         rejection_reason = case when p_approve then null else p_reason end,
         reviewer_id = auth.uid(),
         reviewed_at = now()
   where id = p_id and status = 'pending'
   returning type, user_id into v_type, v_user;

  if v_user is null then
    raise exception 'demande introuvable ou deja traitee';
  end if;

  if p_approve then
    update public.profiles
       set identity_verified = case when v_type = 'identity' then true else identity_verified end,
           genotype_verified = case when v_type = 'genotype' then true else genotype_verified end,
           verified_at = now()
     where user_id = v_user;
  end if;
end $$;

revoke execute on function public.review_verification(uuid, boolean, text, text) from public;
grant execute on function public.review_verification(uuid, boolean, text, text) to authenticated;

-- Controle de securite : cette policy ne doit PAS laisser modifier `role`
select policyname, cmd, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'profiles' and cmd = 'UPDATE';
```

**Bloc 5 — notification de décision + accusé de lecture**

```sql
-- 5a) Marque une décision comme vue par l'utilisateur (indicateur « Nouveau »)
alter table public.verifications
  add column if not exists user_seen_at timestamptz;

create or replace function public.mark_verifications_seen()
returns void language sql security definer set search_path = public as $$
  update public.verifications
     set user_seen_at = now()
   where user_id = auth.uid()
     and reviewed_at is not null
     and user_seen_at is null;
$$;

revoke execute on function public.mark_verifications_seen() from public;
grant execute on function public.mark_verifications_seen() to authenticated;

-- 5b) Push a chaque décision (pg_net -> API Expo Push)
create extension if not exists pg_net;

create or replace function public.notify_verification_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_token text; v_label text; v_status text;
begin
  if new.status = old.status or new.status not in ('approved','rejected') then
    return new;
  end if;

  select push_token into v_token from public.profiles where user_id = new.user_id;
  if v_token is null or v_token = '' then return new; end if;   -- pas de token : on saute

  v_label  := case new.type when 'identity' then 'Pièce d''identité' else 'Génotype' end;
  v_status := case when new.status = 'approved' then 'validée' else 'refusée' end;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'to', v_token,
      'title', v_label || ' ' || v_status,
      'body', case when new.status = 'approved'
                   then 'Votre vérification a été validée. Merci !'
                   else coalesce(new.rejection_reason, 'Votre document n''a pas pu être validé.') end,
      'sound', 'default',
      'channelId', 'verifications',
      'data', jsonb_build_object('type', 'verification', 'status', new.status)
    )
  );
  return new;
end $$;

drop trigger if exists on_verification_reviewed on public.verifications;
create trigger on_verification_reviewed
after update on public.verifications
for each row execute function public.notify_verification_status();
```

> Si `create extension pg_net` répond *not available* : **Dashboard → Database → Extensions → pg_net**, puis relance.
> Le trigger est **asynchrone** (il ne bloque jamais la validation admin). Pour vérifier un envoi :
> `select * from net._http_response order by created desc limit 5;`

> ⚠️ Ne pas remplacer ce bloc par `alter publication … set table …` : cette forme **écrase** la
> liste des tables publiées et retirerait `messages`.
> `ERROR: 42710: relation "…" is already member of publication` signifie simplement que la table
> est **déjà** publiée : le bloc ci-dessus devient un no-op. En revanche, comme l'éditeur SQL
> exécute tout le script dans une transaction, une telle erreur **annule aussi les instructions
> précédentes** — d'où l'intérêt des 4 blocs séparés.

> Sans le bloc 1, l'app bascule automatiquement sur le repli « une requête par conversation ».
> Sans le bloc 2, elle utilise un **repli paginé côté client** : profils lus par pages (50 par page,
> 8 pages maximum), exclusion des swipes et filtre d'âge appliqués localement — quelques requêtes
> en plus, mais aucune liste d'identifiants dans l'URL. L'absence est mémorisée : un seul
> `console.warn` puis plus aucune tentative jusqu'au prochain démarrage.
> Sans le bloc 3, un rafraîchissement de secours toutes les 90 s remplace le temps réel.
> Sans le bloc 4, la table `verifications` manque : l'écran **Vérifications** et la file admin
> remontent une erreur explicite (avec bouton Réessayer) au lieu de planter.

**Blocs 6 à 8 — toutes les notifications (fichiers `sql/`)**

Trop longs pour être inlinés ici, les blocs 6 à 8 vivent dans `sql/` et se collent **dans cet ordre**
(l'éditeur SQL exécute chaque fichier en une seule transaction) :

| Étape | Fichier | Rôle |
|---|---|---|
| 1 | `sql/push-0-diagnostic.sql` | contrôle de `pg_net`/`pg_cron`, des colonnes (`matches.created_at`, `messages.read`, `swipes.direction`…) et des tokens |
| 2 | `eas update --branch preview` | **pousser les canaux Android** (`messages`, `matches`, `coaching`, `system`) : un `channelId` inconnu de l'APK installé = notification perdue |
| 3 | `sql/push-6-fondations.sql` | `send_push` (envois découpés par 100 + `push_log`), `tokens_for`, `push_allowed` (anti-spam), colonne `coaching_posts.user_id` |
| 4 | *Dashboard → Database → Webhooks* | **supprimer les 3 webhooks `notify-*`** — sinon chaque événement partirait deux fois |
| 5 | `sql/push-7-triggers.sql` | les **8 triggers** (les 4 des Edge Functions migrés + 4 nouveaux) |
| 6 | `sql/push-8-cron.sql` | les **4 relances** `pg_cron` + purge du journal (nécessite `pg_cron` activé) |

> Les Edge Functions `supabase/functions/notify-*` restent dans le dépôt mais deviennent **inactives**
> (aucun webhook ne les appelle) : c'est le filet de retour. Sans le bloc 6, le bloc 7 échoue
> (fonctions `send_push`/`push_allowed` manquantes) ; sans le bloc 7, seule la décision de
> vérification du bloc 5 continue de partir.

## 🛡️ Vérification d'identité & génotype

Deux vérifications indépendantes, lancées depuis **Mon Profil → Confiance** :

| | Pièces demandées | Ce qui est contrôlé |
|---|---|---|
| **Identité** | CNIE (ou passeport) recto + verso | le nom du document correspond au profil |
| **Génotype** | analyse de laboratoire (électrophorèse de l'hémoglobine) | le génotype du document correspond à celui déclaré (AA / AS / SS) |

- **Côté utilisateur** (`app/verification.tsx`) : statut `À vérifier → En relecture → Vérifiée / Refusée (motif)`, photo prise à l'appareil ou choisie dans la galerie, envoi immédiat vers le bucket privé.
- **Côté admin** (`app/admin/verifications.tsx`, réservé à `role ∈ {admin, manager}`) : file d'attente, documents affichés via **URL signée 5 min**, boutons **Valider** / **Refuser** (motif obligatoire, visible par l'utilisateur).
- **Badges** : pastille ronde ambre (coche blanche) posée sur les photos — avatar de **Mon Profil** (bas-droit), carte du deck (sous la barre des points, haut-droit), avatars de **Messages** (haut-droit) et du **Chat** — et icône seule à côté du prénom dans la fiche profil. Un profil qui n'a qu'une des deux validations garde l'icône d'identité (cyan) + la pastille « Génotype … vérifié ». Les colonnes `identity_verified` / `genotype_verified` étant dénormalisées dans `profiles`, cela ne coûte **aucune requête supplémentaire**.
- **Sécurité** : bucket privé ; l'utilisateur n'a ni UPDATE ni DELETE sur sa demande (donc aucune auto-validation) ; `review_verification` est `security definer` et vérifie elle-même `is_admin()` ; les deux colonnes de badges ne sont modifiables que par cette RPC.
- **Vie privée** : seules les décisions sont conservées (`reviewer_id`, `verified_value`, `reviewed_at`). Pour purger les documents au-delà de 90 jours :
  ```sql
  delete from storage.objects
  where bucket_id = 'verifications' and created_at < now() - interval '90 days';
  ```

### Notifications et certification

- **Déclencheur** : à chaque `approved` / `rejected`, `notify_verification_status()` (bloc 5) envoie une push via l'API Expo Push — pas d'Edge Function à déployer. Sans `push_token` enregistré, rien n'est envoyé (silencieux).
- **Tap sur la notification** : `data.type = 'verification'` → ouverture directe de l'écran Vérifications, via un canal Android dédié « Vérifications » (l'utilisateur peut le couper sans perdre les autres notifications). Le tap est honoré **aussi quand l'app était fermée** : la dernière réponse est relue au lancement (sinon le listener, monté après le tap, la manquait) ; la navigation attend que l'app soit prête, et un identifiant de notification empêche tout doublon.
- **Indicateur « Nouveau »** : `verifications.user_seen_at` marque une décision déjà vue. La carte **Confiance** de Mon Profil affiche « Nouveau » tant que l'utilisateur n'a pas ouvert l'écran (la RPC `mark_verifications_seen` ne touche que cette colonne, jamais le statut). L'état vit **en base** : il suit l'utilisateur d'un appareil à l'autre, contrairement à un drapeau local.
- **Pastille « Profil certifié »** : dès que **l'identité ET le génotype** sont validés, une pastille ronde ambre remplace les badges individuels sur les photos (plus de texte « Profil certifié » nulle part : la coche seule fait le travail).

### Toutes les notifications (blocs 6-8)

Tout part de `public.send_push` : tokens vides filtrés, envois découpés par 100 (limite Expo),
`push_log` pour tracer (pg_net est asynchrone et muet), `push_throttle` pour l'anti-spam.

| # | Notification | Déclencheur | Cible | Canal / priorité | Au tap |
|---|---|---|---|---|---|
| 1 | 🎉 Nouveau match | `on_match_created` | les 2 users | `matches` / **high** | `match` → Messages |
| 2 | 💬 Nouveau message | `on_message_created` | destinataire (jamais l'émetteur) | `messages` / **high** | `message` → `/chat/:id` |
| 3 | ✨ Nouveau conseil de coaching | `on_coaching_post_created` | broadcast | `coaching` / default | `coaching` → `/coaching/:id` |
| 4 | ✅/❌ Décision de vérification | `on_verification_reviewed` (bloc 5, migré) | demandeur | `verifications` / default | `verification` → Vérification |
| 5 | 💬 Commentaire sur mon post | `on_comment_created` | auteur du post — 1 h/post | `coaching` / default | `coaching` |
| 6 | 👍 Like de mon post | `on_post_like_created` | auteur du post — 30 min/post | `coaching` / default | `coaching` |
| 7 | 💖 « Quelqu'un vous a liké » | `on_swipe_created` | profil liké — 1 h, **anonyme** | `matches` / **high** | `swipe_like` → Découvrir |
| 8 | 🛡️ Nouvelle demande à traiter | `on_verification_submitted` | admins/managers | `verifications` / **high** | `admin_verification` → file admin |

Relances `pg_cron` (heures en **UTC** ; chaque fonction est aussi appelable à la main pour un test) :

| Job | Horaire | Effet | Anti-spam |
|---|---|---|---|
| `job_match_no_message` | 10 h/jour | « Dites bonjour » sur un match ≥ 24 h sans message | 24 h/match |
| `job_unread_digest` | 18 h/jour | « N messages non lus » | 20 h/utilisateur |
| `job_profile_incomplete` | 11 h/jour | profil incomplet depuis 48 h | 72 h/utilisateur |
| `job_city_digest` | lundi 18 h | « N nouveaux profils à {ville} » | 7 j/ville |
| purge `push_log` | 04 h/jour | nettoyage au-delà de 7 jours | — |

- **Canaux Android** : créés **au démarrage de l'app** (plus seulement après connexion) dans `app/_layout.tsx` — `messages`, `matches` en priorité haute, puis `coaching`, `verifications`, `system`. Couper « Coaching » dans les réglages du téléphone ne coupe pas les messages. Un `channelId` envoyé à un APK qui ne connaît pas le canal = notification perdue : d'où l'étape `eas update` dans l'ordre d'application.
- **Deep links** : `routeFromNotification` route `match`, `message`, `coaching`, `verification`, plus les nouveaux `swipe_like` et `admin_verification` ; un type sans route (ex. `city_digest`) ouvre simplement l'app.
- **Privacy** : le contenu d'un message n'apparaît jamais dans la notification (verrouille l'écran), et un like de swipe reste anonyme jusqu'au match.
- **Tests** :
  ```sql
  -- envoi direct (remplacer par ton token)
  select public.send_push(array['ExponentPushToken[...]'], 'Test', 'corps',
                          '{"type":"match"}'::jsonb, 'matches', 'high');
  -- journal des envois
  select * from public.push_log order by sent_at desc limit 20;
  -- relances, sans attendre le cron
  select public.job_match_no_message();
  ```
  puis un événement réel par famille : message, commentaire, like de post, swipe like,
  soumission d'une vérification (push admin), décision de vérification.

> ✅ **Push Android opérationnelle (FCM configuré).** Projet Firebase `serious-app1`, app Android `com.skylimit.seriousapp`. Les deux identifiants vivent **côté EAS**, jamais dans le dépôt (public) :
>
> 1. **`google-services.json`** — Firebase → *Project settings → Your apps → Android* → **Download google-services.json**, posé à la racine (ignoré par `.gitignore`), puis déclaré comme **variable d'environnement de type fichier** EAS :
>
>    ```bash
>    npx eas-cli env:set --name GOOGLE_SERVICES_JSON --value ./google-services.json \
>      --type file --environment preview --visibility sensitive --non-interactive
>    ```
>
>    `eas credentials` ne sait pas gérer ce fichier (keystore et clé FCM v1 seulement). Sur le runner, la variable contient le **chemin** d'une copie placée **hors** du dossier projet ; `app.config.js` l'injecte dans `android.googleServicesFile` (la config `app.json` étant statique, elle ne peut pas référencer une variable d'env). Visibilité **sensitive** et non *secret* : la config dynamique est résolue aussi **localement** par EAS CLI, et seules les visibilités *plain text/sensitive* y sont lisibles.
> 2. **clé de compte de service FCM v1** — Firebase → *Project settings → Service accounts → **Generate new private key***, puis `npx eas-cli credentials -p android` → **Google Service Account** → *Manage your Google Service Account Key for Push Notifications (FCM V1)* → *Upload*. L'entrée « Push Notifications (Legacy) » est inutile : l'API legacy FCM est fermée par Google.
>
> ⚠️ Ces identifiants sont embarqués **au build** : après tout changement, il faut **un nouveau build** (`npx eas-cli build -p android --profile preview`) — non poussable en OTA. Le `google-services.json` et les clés de compte de service restent hors dépôt. La variable est attachée à l'environnement **preview** ; pour un build `production`, l'attacher aussi à `production` (`--environment production`).
>
> Vérification : `select push_token from profiles where user_id = auth.uid();` doit renvoyer un `ExponentPushToken[...]`, et un envoi de test se fait avec
> `curl -X POST https://exp.host/--/api/v2/push/send -H 'Content-Type: application/json' -d '{"to":"<token>","title":"test","body":"coucou"}'`.

## 🎯 Matching & filtres (écran « Découvrir »)

### Matching strict par genre

- Un profil ne voit **que le genre opposé** (`homme` ↔ `femme`), appliqué **côté serveur** : paramètre `p_gender` de la RPC `get_candidate_profiles`, et clause `.eq('gender', …)` sur le repli sans RPC (`lib/candidates.ts`).
- Filet de sécurité **côté client** (`matchesTargetGender`) : si la RPC en base n'a pas encore la version avec `p_gender`, son erreur fait basculer sur le repli — qui filtre déjà le genre — au lieu de laisser passer n'importe qui.
- Si le visiteur n'a pas de genre (ancien compte), aucun filtre n'est appliqué plutôt que de vider le deck. La création de profil impose désormais le genre (étape 1).

### Filtres de l'écran

| Filtre | UI | effet sur la requête |
|---|---|---|
| Âge (min / max en tranches 18-70 / 25-80) | modale Filtres | RPC `p_age_min` / `p_age_max` + recontrôle client |
| Ville | modale `CityPickerModal` + recherche (villes de `lib/cities.ts`, préfectures retirées) | RPC `p_city` (`ilike`) |
| Groupe sanguin | puces | RPC `p_blood_type` |
| Drépanocytose (AA/AS/SS/Inconnu) | puces | RPC `p_sickle_cell` |
| Genre | *(aucune UI : imposé)* | RPC `p_gender` |

- **Brouillon** : la modale édite `draftFilters`, seul « Appliquer » recharge le deck (avant, chaque pucelle relançait une requête pendant la saisie). « Réinitialiser les filtres » revient aux valeurs par défaut (18-70 ans, sans ville ni groupe).
- **Compteur** : pastille rouge sur le bouton Filtres = nombre de critères écartés des valeurs par défaut.
- **Sélecteur de ville partagé** (`components/city-picker-modal.tsx`) : feuille basse + recherche insensible aux accents, utilisée par le formulaire de profil **et** par la modale Filtres (option « Toutes les villes »).
- **Pastilles** : la pastille du deck est descendue sous la barre des points de pagination ; celle de Messages est passée en haut-droit de l'avatar (le point « en ligne » occupe le bas-droit).
- **Pas de filtre de distance** : aucun champ de géolocalisation (latitude/longitude) n'existe dans `profiles`, seule la ville est stockée → la distance n'est pas auditable ni applicable en l'état.

## 📦 Build « preview » & mises à jour OTA

### 1. APK de test — installable sans Metro

```bash
npx eas build --profile preview --platform android
```

Le profil `preview` (`eas.json` : `distribution: internal`, `channel: preview`, `environment: preview`)
produit un **APK en distribution interne** embarquant le code natif compilé **et** le bundle JS.
Plus besoin de câble, de Metro ou du même Wi-Fi : c'est le test en conditions réelles (réseau mobile,
caméra, notifications, deep links OAuth), et la base sur laquelle s'appliquent les mises à jour OTA.

### 2. Correctifs JS sans rebuild

```bash
npx eas update --branch preview --message "fix swipe + états d'erreur"
```

À chaque lancement, l'app installée compare son `runtimeVersion` (`app.json` → `policy: appVersion`)
à `updates.url` et télécharge le bundle du canal correspondant : **~1 min au lieu de 15-30 min de
file EAS + réinstallation de l'APK**. Il faut relancer l'app **deux fois** (téléchargement au premier
lancement, application au suivant).

| ✅ passe en OTA (`eas update`) | ❌ exige un nouveau build (`eas build`) |
|---|---|
| TS/JS, écrans, styles, textes, `lib/` | nouvelle lib **native**, `plugins` de `app.json` |
| assets ajoutés au bundle | permissions, icône/splash, `android.package` |
| corrections de bugs, libs JS pures | bump de SDK ou de `version` (= `runtimeVersion`) |

- **Retour arrière** : `npx eas update:rollback`, ou republier l'update précédent sur la branche.
- **Isolation** : `runtimeVersion` suit `appVersion`, donc une app 1.0.0 ne recevra jamais un update
  écrit pour 1.0.1 → aucun risque d'incompatibilité entre natif et JS.
- **Production** : `npx eas build --profile production` puis `npx eas submit --profile production`.

## ✨ Design & Expérience

L'application suit une charte graphique premium articulée autour de dégradés vibrants (`#f43f5e` ➡️ `#ec4899`), optimisée pour le **Dark Mode** et offrant un retour haptique à chaque interaction clé pour une expérience utilisateur tactile et vivante.
