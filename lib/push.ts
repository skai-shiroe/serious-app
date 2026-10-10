// Wrapper autour d'expo-notifications, compatible Expo Go.
//
// Depuis le SDK 53, le module natif push n'existe plus dans Expo Go
// (Android) : un `import ... from 'expo-notifications'` statique leve une
// exception au chargement du module et fait planter tout le layout.
// Ici le module est charge en require() protege : absent => toutes les
// fonctions deviennent des no-op silencieux (avec un log explicite).
// En dev client / build preview, le natif est present et tout fonctionne
// comme avant (token, canaux Android, routage au tap, cold start).
import type * as NotificationsType from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Charge paresseusement : sous Expo Go le require leve -> null.
declare const require: ((id: string) => unknown) | undefined;

function loadNotifications(): typeof NotificationsType | null {
  try {
    if (typeof require === 'undefined') return null;
    const mod = require('expo-notifications') as typeof NotificationsType;
    return mod ?? null;
  } catch {
    return null;
  }
}

const Notifications = loadNotifications();

/** Vrai quand le push natif peut fonctionner (dev client / build, jamais Expo Go). */
export function isPushSupported(): boolean {
  if (Notifications == null) return false;
  if (!Device.isDevice) return false;
  // Constants.appOwnership === 'expo' sous Expo Go.
  if (Constants.appOwnership === 'expo') return false;
  return true;
}

/** A appeler une fois au demarrage (remplace le setNotificationHandler top-level). */
export function setupNotificationHandler(): void {
  if (Notifications == null) {
    console.log('[Push] expo-notifications indisponible (Expo Go) : push desactives.');
    return;
  }
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/** Cree les 5 canaux Android. No-op sous Expo Go / non-Android. */
export async function ensureAndroidChannels(): Promise<void> {
  if (Notifications == null) return;
  if (Platform.OS !== 'android') return;
  const channels: {
    id: string;
    name: string;
    importance: NotificationsType.AndroidImportance;
  }[] = [
    { id: 'messages', name: 'Messages', importance: Notifications.AndroidImportance.HIGH },
    { id: 'matches', name: 'Matchs', importance: Notifications.AndroidImportance.HIGH },
    { id: 'coaching', name: 'Coaching', importance: Notifications.AndroidImportance.DEFAULT },
    {
      id: 'verifications',
      name: 'Vérifications',
      importance: Notifications.AndroidImportance.DEFAULT,
    },
    { id: 'system', name: 'Général', importance: Notifications.AndroidImportance.DEFAULT },
  ];
  for (const channel of channels) {
    await Notifications.setNotificationChannelAsync(channel.id, {
      name: channel.name,
      importance: channel.importance,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#f43f5e',
    });
  }
}

export type NotificationResponse = NotificationsType.NotificationResponse;

/** Demande la permission puis enregistre le token Expo dans profiles. */
export async function registerPushToken(
  savePushToken: (token: string) => Promise<void>
): Promise<void> {
  if (!isPushSupported() || Notifications == null) {
    console.log('[Push] enregistrement du token ignore (Expo Go ou emulateur).');
    return;
  }
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.log('Permission de notification refusee.');
    return;
  }
  try {
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    let token: string | undefined;
    if (projectId) {
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } else {
      console.warn(
        "projectId EAS introuvable dans expoConfig.extra.eas : utilisation du mode par defaut."
      );
      token = (await Notifications.getExpoPushTokenAsync()).data;
    }
    if (token) {
      await savePushToken(token);
      return;
    }
    console.log('Aucun token push obtenu.');
  } catch (e) {
    console.log('Erreur lors de la récupération du token push:', e);
  }
}

type RouteFn = (response: NotificationsType.NotificationResponse | null) => void;

/**
 * Abonne le routage des taps + relit la derniere reponse (cold start).
 * Fonction plain (pas un hook : aucun Hook React dedans) a appeler dans un
 * useEffect du layout. Retourne une fonction de nettoyage. No-op sous Expo Go.
 */
export function subscribeNotificationRouting(
  routeFromNotification: RouteFn,
  markReady: () => void
): () => void {
  if (Notifications == null) {
    console.log('[Push] routage des notifications desactive (Expo Go).');
    markReady();
    return () => {};
  }
  const handled = new Set<string>();
  const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
    routeFromNotification(response)
  );

  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (response && !handled.has(response.notification.request.identifier)) {
        handled.add(response.notification.request.identifier);
        routeFromNotification(response);
      }
    })
    .catch(() => undefined)
    .finally(() => {
      markReady();
    });

  return () => {
    subscription.remove();
  };
}
