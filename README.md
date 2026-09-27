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
-- L'ancienne signature (sans les bornes d'âge) est retirée si elle existe.
drop function if exists get_candidate_profiles(integer, uuid, text, text, text);

-- Exclusion des profils déjà swipés faite par PostgreSQL (jamais par une liste
-- d'identifiants dans l'URL de la requête), pagination par curseur
-- (p_after = dernier user_id parcouru) et filtre d'âge côté serveur.
create or replace function get_candidate_profiles(
  p_limit integer default 30,
  p_after uuid default null,
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

revoke execute on function get_candidate_profiles(integer, uuid, text, text, text, integer, integer) from public;
grant execute on function get_candidate_profiles(integer, uuid, text, text, text, integer, integer) to authenticated;
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
