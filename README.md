# Serious App 💖

Une application de rencontre moderne et engagée, conçue avec un focus particulier sur la compatibilité santé (Groupe Sanguin et Statut Drépanocytaire).

## 🚀 Fonctionnalités Principales

- **Authentification Sécurisée** : Gestion des sessions via Supabase Auth.
- **Profils Avancés** :
  - Upload de photos multiples.
  - Calcul dynamique de l''âge via la date de naissance.
  - Informations de santé intégrées (Pills visuelles).
- **Matching Immersif (Tinder-style)** :
  - Swipe Cards à 60 FPS avec `react-native-reanimated` et `gesture-handler`.
  - Gestes multicouches : Tap pour les photos/détails, Swipe pour l''action.
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
  - `expo-image` pour un cache d''images ultra-performant.
  - `lucide-react-native` pour l''iconographie.

## 🛠️ Installation & Lancement

1. **Installation des dépendances** :
   ```bash
   npm install
   ```

2. **Variables d''environnement** :
   Créez un fichier `.env` à la racine avec vos accès Supabase :
   ```env
   EXPO_PUBLIC_SUPABASE_URL=VOTRE_URL_SUPABASE
   EXPO_PUBLIC_SUPABASE_ANON_KEY=VOTRE_CLE_ANON
   ```

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

> `seriousapp://auth-callback` est l''URL utilisée par les builds natifs (dev build / production),
> `exp+seriousapp://auth-callback` par Expo Go, et les URLs `http://...` servent au développement web.

## 📲 Development Build (sans Expo Go)

```bash
# 1. Dépendance du client de développement (obligatoire)
npx expo install expo-dev-client

# 2. Build cloud de développement (APK installable)
npx eas-cli build --profile development --platform android

# 3. Installer l''APK sur l''appareil, puis lancer le bundler
npx expo start --dev-client
```

**Pré-requis push notifications (Android)** : les dev builds n''utilisent plus les credentials
FCM d''Expo Go. Il faut ajouter un **FCM Service Account Key** dans
EAS → Project → Credentials → Android, sinon les Edge Functions `notify-*` échoueront.

## 📜 Base de Données

Le projet utilise les tables suivantes dans Supabase :
- `profiles` : Informations détaillées des membres.
- `swipes` : Historique des interactions Gauche/Droite.
- `matches` : Paires d''utilisateurs ayant matché.
- `messages` : Échanges textuels sécurisés.
- `presence` : Suivi léger de l''activité des utilisateurs.

## ✨ Design & Expérience

L''application suit une charte graphique premium articulée autour de dégradés vibrants (`#f43f5e` ➡️ `#ec4899`), optimisée pour le **Dark Mode** et offrant un retour haptique à chaque interaction clé pour une expérience utilisateur tactile et vivante.
