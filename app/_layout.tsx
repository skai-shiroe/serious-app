import { Stack, useRouter, useSegments, DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  View,
  Appearance,
  Platform,
  Dimensions,
  Text,
  TouchableOpacity, 
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
  LogBox,
} from 'react-native';
import { Image } from 'expo-image';
import {
  X as XIcon,
  MapPin,
  Briefcase,
  GraduationCap,
  Flag,
  Ban,
} from 'lucide-react-native';
import {
  CertifiedIcon,
  GenotypeVerifiedBadge,
  IdentityVerifiedIcon,
  VERIFIED_COLOR,
  isFullyVerified,
} from '@/components/verified-badge';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { watchAppSetting } from '@/lib/app-settings';
import { currentUserId, getUser, validateSession } from '@/lib/session';
import {
  REPORT_REASONS,
  fetchReportReasons,
  blockUser,
  isUserBlocked,
  reportUser,
  unblockUser,
  type ReportReason,
} from '@/lib/moderation';
import { OnboardingScreen } from '@/components/onboarding-screen';
import AuthScreen from '@/components/auth-screen';
import ProfileCreation from '@/components/profile-creation';
import { ProfileSheetProvider, useProfileSheet } from '@/contexts/ProfileSheetContext';
import { IMAGE_CACHE_POLICY, imageSource } from '@/lib/images';
import { usePresenceHeartbeat } from '@/hooks/use-presence';
import {
  setupNotificationHandler,
  ensureAndroidChannels,
  registerPushToken,
  subscribeNotificationRouting,
} from '@/lib/push';
import type { NotificationResponse } from '@/lib/push';

// Le splash natif reste affiche jusqu a ce que l etat auth + profil soit connu :
// evite tout clignotement entre l ecran de login, "Completer le profil" et l accueil.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Bruit console benin emis par GoTrue au demarrage quand le refresh token
// stocke localement est perime/revoque (compte supprime, deconnexion partielle,
// session expiree). La session invalide est purgee par validateSession() ->
// forgetSession() et l'utilisateur retombe sur l'ecran de connexion.
LogBox.ignoreLogs(['Invalid Refresh Token', 'Refresh Token Not Found']);

type ProfileStatus = 'unknown' | 'ready' | 'missing';

// Cache local du statut de profil, par utilisateur : demarrage instantane,
// la revalidation serveur se faisant ensuite en arriere-plan.
const PROFILE_CACHE_PREFIX = 'profile_ready:';

async function readProfileCache(userId: string): Promise<boolean | null> {
  try {
    const value = await AsyncStorage.getItem(PROFILE_CACHE_PREFIX + userId);
    if (value === null) return null;
    return value === '1';
  } catch {
    return null;
  }
}

async function writeProfileCache(userId: string, ready: boolean): Promise<void> {
  try {
    if (ready) await AsyncStorage.setItem(PROFILE_CACHE_PREFIX + userId, '1');
    else await AsyncStorage.removeItem(PROFILE_CACHE_PREFIX + userId);
  } catch {}
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const unstable_settings = {
  anchor: '(tabs)',
};

/**
 * Boutons Signaler / Bloquer — exigence des stores pour toute app de
 * rencontre a contenu genere par les utilisateurs.
 * - Signaler : ouvre le choix du motif puis alimente la file admin.
 * - Bloquer : blocage bilatral (deck + conversations) ; la fiche se ferme.
 */
function ProfileModerationActions({
  targetUserId,
  targetName,
  onBlocked,
}: {
  targetUserId: string;
  targetName: string;
  onBlocked?: () => void;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  // null = etat inconnu (chargement) : on n'affiche jamais Bloquer par erreur.
  const [isBlocked, setIsBlocked] = useState<boolean | null>(null);
  const [choosingReason, setChoosingReason] = useState(false);
  const [reportReasons, setReportReasons] = useState(REPORT_REASONS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const dynamicReasons = await fetchReportReasons();
      if (alive) setReportReasons(dynamicReasons);
      const me = await getUser();
      if (!alive || !me || me.id === targetUserId) return;
      const blocked = await isUserBlocked(me.id, targetUserId);
      if (alive) setIsBlocked(blocked);
    })();
    return () => {
      alive = false;
    };
  }, [targetUserId]);

  const handleReport = async (reason: ReportReason) => {
    setChoosingReason(false);
    try {
      const me = await getUser();
      if (!me) return;
      await reportUser(me.id, targetUserId, reason);
      Alert.alert('Signalement envoyé', `Merci, l'équipe examinera ${targetName}.`);
    } catch {
      Alert.alert('Erreur', "Impossible d'envoyer le signalement");
    }
  };

  const handleToggleBlock = async () => {
    if (busy || isBlocked === null) return;
    setBusy(true);
    try {
      const me = await getUser();
      if (!me) return;
      if (isBlocked) {
        await unblockUser(me.id, targetUserId);
        setIsBlocked(false);
      } else {
        await blockUser(me.id, targetUserId);
        setIsBlocked(true);
        // Le profil disparait du deck et des conversations des que la fiche se ferme.
        onBlocked?.();
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de modifier le blocage');
    } finally {
      setBusy(false);
    }
  };

  const muted = isDark ? '#9ca3af' : '#6b7280';
  const border = isDark ? '#1f2937' : '#f3f4f6';

  if (choosingReason) {
    return (
      <View style={{ marginTop: 24, gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', color: isDark ? '#fff' : '#111827', marginBottom: 4 }}>
          Pourquoi signaler {targetName} ?
        </Text>
        {reportReasons.map((reason) => (
          <TouchableOpacity
            key={reason.value}
            activeOpacity={0.7}
            onPress={() => handleReport(reason.value)}
            style={{ borderWidth: 1, borderColor: border, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 }}
          >
            <Text style={{ color: isDark ? '#e5e7eb' : '#374151', fontSize: 15 }}>{reason.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity activeOpacity={0.7} onPress={() => setChoosingReason(false)} style={{ paddingVertical: 10 }}>
          <Text style={{ color: muted, fontSize: 14, textAlign: 'center' }}>Annuler</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ marginTop: 24, flexDirection: 'row', gap: 12 }}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setChoosingReason(true)}
        style={{ flex: 1, borderWidth: 1, borderColor: border, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
      >
        <Flag size={18} color={muted} />
        <Text style={{ color: muted, fontSize: 13, fontWeight: '600', marginTop: 4 }}>Signaler</Text>
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.7}
        disabled={busy || isBlocked === null}
        onPress={handleToggleBlock}
        style={{
          flex: 1,
          borderWidth: 1,
          borderColor: isBlocked ? '#ef4444' : border,
          borderRadius: 12,
          paddingVertical: 12,
          alignItems: 'center',
          opacity: busy || isBlocked === null ? 0.5 : 1,
        }}
      >
        <Ban size={18} color={isBlocked ? '#22c55e' : '#ef4444'} />
        <Text style={{ color: isBlocked ? '#22c55e' : '#ef4444', fontSize: 13, fontWeight: '600', marginTop: 4 }}>
          {isBlocked === null ? '…' : isBlocked ? 'Débloquer' : 'Bloquer'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function ProfileBottomSheet() {
  const { selectedProfile, closeProfileSheet } = useProfileSheet();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const calculateAge = (birthDateStr: string | null) => {
    if (!birthDateStr) return null;
    const birthDate = new Date(birthDateStr);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  // Fiche reimplementee en interne (Modal + Reanimated) : @gorhom/bottom-sheet
  // est INUTILISABLE avec Reanimated 4 (RN 0.86 / SDK 57) — ses reactions
  // animées ne se declenchent jamais, la feuille reste hors ecran sans erreur
  // (gorhom issues #2696 / #2721, correctif PR #2720 jamais fusionne).
  // Ici : ouverture/fermeture animees par des shared values, sans aucune
  // dependance aux reactions de la lib.
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  // Dernier profil connu : il reste rendu pendant l'animation de sortie.
  const [rendered, setRendered] = useState<any>(null);

  useEffect(() => {
    if (selectedProfile) {
      setRendered(selectedProfile);
      backdropOpacity.value = withTiming(1, { duration: 220 });
      translateY.value = withSpring(0, { damping: 24, stiffness: 260, mass: 0.9 });
    } else {
      backdropOpacity.value = withTiming(0, { duration: 220 });
      translateY.value = withTiming(SCREEN_HEIGHT, { duration: 250 }, (finished) => {
        // On ne vide le contenu que si la fermeture est allee au bout :
        // une re-ouverture pendant l'animation est donc possible.
        if (finished) runOnJS(setRendered)(null);
      });
    }
  }, [selectedProfile, translateY, backdropOpacity]);

  const requestClose = useCallback(() => {
    closeProfileSheet(selectedProfile);
  }, [closeProfileSheet, selectedProfile]);

  // Drag-to-close depuis la poignee (le scroll du contenu reste intact :
  // le geste n'est rattache qu'a la zone de l'indicateur).
  const dragGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > 140 || event.velocityY > 900) {
        runOnJS(requestClose)();
      } else {
        translateY.value = withSpring(0, { damping: 24, stiffness: 260, mass: 0.9 });
      }
    });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!rendered) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={requestClose}
      statusBarTranslucent
    >
      {/* Racine gestes obligatoire dans un Modal RN (fenetre separee). */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }, backdropStyle]}>
          {/* Tap sur le fond : ferme (comme le pan-down de l'ancienne feuille). */}
          <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} />
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: Math.round(SCREEN_HEIGHT * 0.9),
                backgroundColor: isDark ? '#111827' : '#ffffff',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                overflow: 'hidden',
              },
              panelStyle,
            ]}
          >
            {/* Poignee : zone de drag-to-close. */}
            <GestureDetector gesture={dragGesture}>
              <View
                style={{
                  height: 28,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isDark ? '#111827' : '#ffffff',
                }}
                accessibilityLabel="Fermer la fiche profil"
              >
                <View
                  style={{
                    width: 44,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: isDark ? '#4b5563' : '#d1d5db',
                  }}
                />
              </View>
            </GestureDetector>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} style={{ flex: 1 }}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ height: 450 }}>
          {rendered.photos?.map((photo: string, index: number) => (
            <Image
              key={index}
              source={imageSource(photo)}
              style={{ width: SCREEN_WIDTH, height: 450 }}
              contentFit="cover"
              cachePolicy={IMAGE_CACHE_POLICY}
              recyclingKey={`sheet-photo-${index}`}
            />
          ))}
        </ScrollView>

        <View style={{ padding: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 32, fontWeight: 'bold', color: isDark ? '#fff' : '#111827' }}>
                {rendered.first_name}
              </Text>
              {isFullyVerified(rendered) ? (
                <CertifiedIcon size={22} />
              ) : (
                rendered.identity_verified && (
                  <IdentityVerifiedIcon size={22} color={VERIFIED_COLOR} />
                )
              )}
              <Text style={{ fontSize: 24, color: isDark ? '#fff' : '#111827', opacity: 0.8 }}>
                {calculateAge(rendered.birth_date)}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 20 }}>
            <MapPin size={16} color={isDark ? '#9ca3af' : '#6b7280'} />
            <Text style={{ fontSize: 16, color: isDark ? '#9ca3af' : '#6b7280' }}>
              {rendered.city}
            </Text>
          </View>

          <View style={{ gap: 12, marginBottom: 24 }}>
            {rendered.profession && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Briefcase size={20} color="#f43f5e" />
                <Text style={{ fontSize: 16, color: isDark ? '#e5e7eb' : '#374151' }}>{rendered.profession}</Text>
              </View>
            )}
            {rendered.religion && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <GraduationCap size={20} color="#f43f5e" />
                <Text style={{ fontSize: 16, color: isDark ? '#e5e7eb' : '#374151' }}>{rendered.religion}</Text>
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
            <View style={{ backgroundColor: 'rgba(244,63,94,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
              <Text style={{ color: '#f43f5e', fontWeight: 'bold' }}>{rendered.blood_type}</Text>
            </View>
            <View style={{ backgroundColor: 'rgba(59,130,246,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
              <Text style={{ color: '#3b82f6', fontWeight: 'bold' }}>Drépanocytose : {rendered.sickle_cell}</Text>
            </View>
            {!isFullyVerified(rendered) && rendered.genotype_verified && (
              <GenotypeVerifiedBadge genotype={rendered.sickle_cell} />
            )}
          </View>

          {rendered.bio && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: isDark ? '#fff' : '#111827', marginBottom: 8 }}>Bio</Text>
              <Text style={{ fontSize: 16, lineHeight: 24, color: isDark ? '#d1d5db' : '#4b5563' }}>{rendered.bio}</Text>
            </View>
          )}

          {rendered.interests && rendered.interests.length > 0 && (
            <View>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: isDark ? '#fff' : '#111827', marginBottom: 12 }}>Intérêts</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {rendered.interests.map((interest: string, idx: number) => (
                  <View key={idx} style={{ backgroundColor: 'rgba(244,63,94,0.1)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 }}>
                    <Text style={{ color: '#f43f5e', fontWeight: '600' }}>{interest}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Signaler / Bloquer : exigence des stores (contenu utilisateur). */}
          {rendered.user_id && rendered.user_id !== currentUserId() && (
            <ProfileModerationActions
              targetUserId={rendered.user_id}
              targetName={rendered.first_name}
              onBlocked={requestClose}
            />
          )}
        </View>
      </ScrollView>

      {/* Fermeture : seule action de la fiche (X en haut a droite, au-dessus
          des photos). Pas de bouton « coeur » : il dupliquait la croix et
          laissait entendre un like qui n'existait pas. Le drag sur la
          poignee, le tap sur le fond et le bouton retour ferment aussi. */}
      <TouchableOpacity
        onPress={requestClose}
        accessibilityRole="button"
        accessibilityLabel="Fermer la fiche profil"
        hitSlop={10}
        style={{
          position: 'absolute',
          top: 40,
          right: 16,
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: 'rgba(0,0,0,0.45)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <XIcon size={22} color="#fff" />
      </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('unknown');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => watchAppSetting<{ maintenance_mode?: boolean }>('app_defaults', {}, (settings) => {
    setMaintenanceMode(settings?.maintenance_mode === true);
  }), []);

  // Routes publiques (CGU / politique de confidentialite) : lisibles avant la
  // creation de compte — exigence des stores. Elles contournent les gates
  // onboarding/auth/profil ci-dessous et s'affichent dans le Stack.
  const isLegalRoute = useSegments()[0] === 'legal';

  // Les 5 canaux sont crees au demarrage quel que soit l'etat d'authentification :
  // un push peut arriver avant la connexion. No-op sous Expo Go (voir lib/push.ts).
  // Le handler d'affichage est pose ici aussi (une seule fois, jamais au top-level
  // du module : sous Expo Go le module natif est absent et l'app doit demarrer).
  useEffect(() => {
    setupNotificationHandler();
    ensureAndroidChannels().catch(() => {});
  }, []);

  // Enregistre le token Expo dans profiles. Declare AVANT l'effet qui l'appelle
  // (const non hoistee : le React Compiler le signalait sinon).
  const savePushToken = async (expoPushToken: string) => {
    try {
      const user = await getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ push_token: expoPushToken })
          .eq('user_id', user.id);
      }
    } catch {}
  };

  const registerForPushNotificationsAsync = async () => {
    // Sous Expo Go : no-op silencieux (voir lib/push.ts).
    await registerPushToken(savePushToken);
  };

  useEffect(() => {
    if (isAuthenticated && profileStatus === 'ready') {
      registerForPushNotificationsAsync();
    }
  }, [isAuthenticated, profileStatus]);

  // Heartbeat de presence global : le statut "En ligne" reste correct meme sans
  // ouvrir un chat (avant, seul l'ecran de chat mettait `presence` a jour).
  usePresenceHeartbeat(isAuthenticated);

  // Tap sur une notification : un seul chemin de navigation pour les DEUX cas.
  // 1. app ouverte (ou en arriere-plan) -> listener ;
  // 2. app TUEe puis relancee par le tap -> getLastNotificationResponseAsync(),
  //    car le listener est monte APRES que le systeme a consomme le tap (le
  //    deep link ne se faisait jamais dans ce cas).
  // L'identifiant de notification evite de router deux fois la meme reponse.

  // Identifiants deja routes : le Set vit dans le composant et survit aux
  // re-abonnements du listener (changement d'isReady) et au re-jeu du cold start.
  const handledNotificationsRef = useRef<Set<string>>(new Set());

  const routeFromNotification = useCallback(
    (response: NotificationResponse | null) => {
      if (!response) return;

      const identifier = response.notification.request.identifier;
      if (handledNotificationsRef.current.has(identifier)) return;
      handledNotificationsRef.current.add(identifier);

      const data = response.notification.request.content.data as any;
      if (data?.type === 'match') {
        router.push('/(tabs)/messages');
      } else if (data?.type === 'message' && data?.match_id) {
        router.push(`/chat/${data.match_id}`);
      } else if (data?.type === 'coaching' && data?.id) {
        // Redirige vers la page du conseil de coaching
        router.push(`/coaching/${data.id}`);
      } else if (data?.type === 'swipe_like') {
        // Like anonyme recu : on ramene vers le deck "Decouvrir"
        router.push('/(tabs)/match');
      } else if (data?.type === 'admin_verification') {
        // Nouvelle demande a traiter (recu uniquement par un admin)
        router.push('/admin/verifications');
      } else if (data?.type === 'verification') {
        // Une décision (validation ou refus) vient d'être rendue
        router.push('/verification');
      }
    },
    [router]
  );

  // Reponse recue AVANT que l'app soit prete : memorisee, routee des que
  // isReady passe a true (sinon la navigation vise un ecran non monte —
  // c'etait le bug historique du deep link a froid).
  const pendingNotificationRef = useRef<NotificationResponse | null>(null);

  // Taps sur notification + cold start (getLastNotificationResponseAsync).
  // No-op sous Expo Go (voir lib/push.ts).
  useEffect(() => {
    return subscribeNotificationRouting(
      (response) => {
        if (isReady) routeFromNotification(response);
        else pendingNotificationRef.current = response;
      },
      () => {}
    );
  }, [routeFromNotification, isReady]);

  // Reponse memorisee pendant le demarrage : routee une fois l'app prete
  // (le dedupe de routeFromNotification evite le double routage si le listener
  // se re-abonne en meme temps et re-delivre la meme reponse).
  useEffect(() => {
    if (!isReady) return;
    const pending = pendingNotificationRef.current;
    if (!pending) return;
    pendingNotificationRef.current = null;
    routeFromNotification(pending);
  }, [isReady, routeFromNotification]);

  useEffect(() => {
    const initTheme = async () => {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          const savedTheme = window.localStorage.getItem('appTheme') as 'light' | 'dark' | null;
          if (savedTheme) Appearance.setColorScheme(savedTheme);
          else Appearance.setColorScheme('light');
        }
        return;
      }

      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const savedTheme = await AsyncStorage.getItem('appTheme') as 'light' | 'dark' | null;
        if (savedTheme) {
          Appearance.setColorScheme(savedTheme);
        } else {
          Appearance.setColorScheme('light');
        }
      } catch (e) {}
    };
    initTheme();
    checkAuthState();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session?.user) {
        setIsAuthenticated(false);
        setIsAdmin(false);
        setProfileStatus('unknown');
        return;
      }

      setHasSeenOnboarding(true);
      setIsAuthenticated(true);

      // On ne reverifie le profil que sur une vraie connexion : inutile de
      // relancer la requete a chaque TOKEN_REFRESHED (une fois par heure).
      if (event === 'SIGNED_IN') {
        setProfileStatus('unknown');
        checkProfile(session.user.id);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Masque le splash natif DAS que l'ecran reel est pret a s'afficher
  // (jamais pendant que le statut de profil est encore inconnu).
  useEffect(() => {
    if (isReady && (!isAuthenticated || profileStatus !== 'unknown')) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [isReady, isAuthenticated, profileStatus]);

  const checkAuthState = async () => {
    try {
      // Lecture locale (aucun appel reseau) + UNE validation serveur au
      // demarrage : sans elle, un compte supprime cote Supabase laisserait
      // l'app "connectee" avec un utilisateur inexistant. Une panne reseau,
      // elle, conserve la session locale.
      const user = await validateSession();
      if (user) {
        setHasSeenOnboarding(true);
        setIsAuthenticated(true);
        checkProfile(user.id);
      }
    } catch {
    } finally {
      setIsReady(true);
    }
  };

  const checkProfile = async (userId: string) => {
    // 1) Cache local : statut immediat pour un utilisateur deja connu
    //    (zero latence au demarrage), puis revalidation serveur.
    const cached = await readProfileCache(userId);
    if (cached !== null) setProfileStatus(cached ? 'ready' : 'missing');

    // 2) Revalidation serveur — .maybeSingle() et non .single() : une erreur
    //    reseau ne doit pas etre interpretee comme "profil absent".
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error) {
        const ready = !!data;
        setIsAdmin(data?.role === 'admin');
        setProfileStatus(ready ? 'ready' : 'missing');
        void writeProfileCache(userId, ready);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }

    // 3) Reseau toujours muet : sans cache, on laisse l'utilisateur entrer plutot
    //    que de lui imposer a tort l'ecran "Completer le profil".
    if (cached === null) {
      setProfileStatus('ready');
    }
  };

  const loadingScreen = (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colorScheme === 'dark' ? '#111827' : '#f9fafb',
      }}
    >
      <ActivityIndicator size="large" color="#f43f5e" />
    </View>
  );

  if (!isReady) {
    return loadingScreen;
  }

  if (!hasSeenOnboarding && !isLegalRoute) {
    return <OnboardingScreen onComplete={() => setHasSeenOnboarding(true)} />;
  }

  if (!isAuthenticated && !isLegalRoute) {
    return (
      <AuthScreen
        onComplete={() => {
          setIsAuthenticated(true);
          // Le statut du profil est inconnu jusqu'a la reponse de checkProfile :
          // on n'affiche surtout pas "Completer le profil" entre-temps (flash de login).
          setProfileStatus('unknown');
        }}
      />
    );
  }

  // Statut du profil encore inconnu (cache vide / requete en cours) : on affiche le
  // loader, JAMAIS l'ecran "Completer le profil" — c'est la correction du flash.
  if (profileStatus === 'unknown' && !isLegalRoute) {
    return loadingScreen;
  }

  if (maintenanceMode && isAuthenticated && !isAdmin && !isLegalRoute) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colorScheme === 'dark' ? '#111827' : '#fff' }}>
        <Text style={{ marginBottom: 12, fontSize: 24, fontWeight: '800', color: colorScheme === 'dark' ? '#fff' : '#111827' }}>Geno est en maintenance</Text>
        <Text style={{ fontSize: 16, lineHeight: 24, textAlign: 'center', color: colorScheme === 'dark' ? '#d1d5db' : '#6b7280' }}>Nous effectuons une mise à jour. Réessaie dans quelques instants.</Text>
      </View>
    );
  }

  if (profileStatus === 'missing' && !isLegalRoute) {
    return (
      <ProfileCreation
        onComplete={async () => {
          setProfileStatus('ready');
          try {
            const user = await getUser();
            if (user) await writeProfileCache(user.id, true);
          } catch {
            // cache best effort
          }
        }}
      />
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ProfileSheetProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ headerShown: false }}>
            {/* Tous les ecrans dessinent leur propre entete (ou sont des
                transitions) : le header natif affichait le nom de route brut
                (« coaching/[id] », « edit-profile »...). */}
            <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          </Stack>
          <StatusBar style="auto" />
          <ProfileBottomSheet />
        </ThemeProvider>
      </ProfileSheetProvider>
    </GestureHandlerRootView>
  );
}
