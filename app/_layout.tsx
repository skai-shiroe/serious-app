import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-reanimated';
import { useState, useEffect, useCallback } from 'react';
import { 
  ActivityIndicator, 
  View, 
  Appearance, 
  Platform, 
  Dimensions, 
  Text, 
  TouchableOpacity, 
  ScrollView 
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  Heart, 
  X as XIcon, 
  MapPin, 
  Briefcase, 
  GraduationCap 
} from 'lucide-react-native';
import BottomSheet, { BottomSheetScrollView, BottomSheetView } from '@gorhom/bottom-sheet';
import {
  GenotypeVerifiedBadge,
  IdentityVerifiedIcon,
  VERIFIED_COLOR,
} from '@/components/verified-badge';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { getUser, validateSession } from '@/lib/session';
import { OnboardingScreen } from '@/components/onboarding-screen';
import AuthScreen from '@/components/auth-screen';
import ProfileCreation from '@/components/profile-creation';
import { ProfileSheetProvider, useProfileSheet } from '@/contexts/ProfileSheetContext';
import { IMAGE_CACHE_POLICY, imageSource } from '@/lib/images';
import { usePresenceHeartbeat } from '@/hooks/use-presence';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Le splash natif reste affiche jusqu a ce que l etat auth + profil soit connu :
// evite tout clignotement entre l ecran de login, "Completer le profil" et l accueil.
SplashScreen.preventAutoHideAsync().catch(() => {});

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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const unstable_settings = {
  anchor: '(tabs)',
};

function ProfileBottomSheet() {
  const { sheetRef, selectedProfile, closeProfileSheet } = useProfileSheet();
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

  if (!selectedProfile) {
    return (
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={['90%']}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: isDark ? '#1f2937' : '#ffffff' }}
        handleIndicatorStyle={{ backgroundColor: isDark ? '#4b5563' : '#d1d5db' }}
      >
        <BottomSheetView style={{ flex: 1 }}>
          <View />
        </BottomSheetView>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={['90%']}
      enablePanDownToClose
      backgroundStyle={{ 
        backgroundColor: isDark ? '#111827' : '#ffffff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
      }}
      handleIndicatorStyle={{ backgroundColor: isDark ? '#4b5563' : '#d1d5db' }}
    >
      <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ height: 450 }}>
          {selectedProfile.photos?.map((photo: string, index: number) => (
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
                {selectedProfile.first_name}
              </Text>
              {selectedProfile.identity_verified && (
                <IdentityVerifiedIcon size={22} color={VERIFIED_COLOR} />
              )}
              <Text style={{ fontSize: 24, color: isDark ? '#fff' : '#111827', opacity: 0.8 }}>
                {calculateAge(selectedProfile.birth_date)}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 20 }}>
            <MapPin size={16} color={isDark ? '#9ca3af' : '#6b7280'} />
            <Text style={{ fontSize: 16, color: isDark ? '#9ca3af' : '#6b7280' }}>
              {selectedProfile.city}
            </Text>
          </View>

          <View style={{ gap: 12, marginBottom: 24 }}>
            {selectedProfile.profession && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Briefcase size={20} color="#f43f5e" />
                <Text style={{ fontSize: 16, color: isDark ? '#e5e7eb' : '#374151' }}>{selectedProfile.profession}</Text>
              </View>
            )}
            {selectedProfile.religion && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <GraduationCap size={20} color="#f43f5e" />
                <Text style={{ fontSize: 16, color: isDark ? '#e5e7eb' : '#374151' }}>{selectedProfile.religion}</Text>
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
            <View style={{ backgroundColor: 'rgba(244,63,94,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
              <Text style={{ color: '#f43f5e', fontWeight: 'bold' }}>{selectedProfile.blood_type}</Text>
            </View>
            <View style={{ backgroundColor: 'rgba(59,130,246,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
              <Text style={{ color: '#3b82f6', fontWeight: 'bold' }}>Drépanocytose : {selectedProfile.sickle_cell}</Text>
            </View>
            {selectedProfile.genotype_verified && (
              <GenotypeVerifiedBadge genotype={selectedProfile.sickle_cell} />
            )}
          </View>

          {selectedProfile.bio && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: isDark ? '#fff' : '#111827', marginBottom: 8 }}>Bio</Text>
              <Text style={{ fontSize: 16, lineHeight: 24, color: isDark ? '#d1d5db' : '#4b5563' }}>{selectedProfile.bio}</Text>
            </View>
          )}

          {selectedProfile.interests && selectedProfile.interests.length > 0 && (
            <View>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: isDark ? '#fff' : '#111827', marginBottom: 12 }}>Intérêts</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {selectedProfile.interests.map((interest: string, idx: number) => (
                  <View key={idx} style={{ backgroundColor: 'rgba(244,63,94,0.1)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 }}>
                    <Text style={{ color: '#f43f5e', fontWeight: '600' }}>{interest}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </BottomSheetScrollView>
      
      <View style={{ 
        position: 'absolute', 
        bottom: 0, 
        left: 0, 
        right: 0, 
        padding: 24, 
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        flexDirection: 'row', 
        justifyContent: 'center', 
        gap: 20,
        backgroundColor: isDark ? '#111827' : '#ffffff',
        borderTopWidth: 1,
        borderTopColor: isDark ? '#1f2937' : '#f3f4f6'
      }}>
        <TouchableOpacity 
          onPress={closeProfileSheet}
          style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: isDark ? '#1f2937' : '#f3f4f6', justifyContent: 'center', alignItems: 'center' }}
        >
          <XIcon size={32} color="#ef4444" />
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={closeProfileSheet}
          style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#f43f5e', justifyContent: 'center', alignItems: 'center' }}
        >
          <Heart size={32} color="#fff" fill="#fff" />
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('unknown');

  useEffect(() => {
    if (isAuthenticated && profileStatus === 'ready') {
      registerForPushNotificationsAsync().then(token => {
        if (token) {
          savePushToken(token);
        }
      });
    }
  }, [isAuthenticated, profileStatus]);

  // Heartbeat de presence global : le statut "En ligne" reste correct meme sans
  // ouvrir un chat (avant, seul l'ecran de chat mettait `presence` a jour).
  usePresenceHeartbeat(isAuthenticated);

  useEffect(() => {
    const responseListener = Notifications.addNotificationResponseReceivedListener((response: any) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'match') {
        router.push('/(tabs)/messages');
      } else if (data?.type === 'message' && data?.match_id) {
        router.push(`/chat/${data.match_id}`);
      } else if (data?.type === 'coaching' && data?.id) {
        // Redirige vers la page du conseil de coaching
        router.push(`/coaching/${data.id}`);
      }
    });

    return () => {
      responseListener.remove();
    };
  }, []);

  async function registerForPushNotificationsAsync() {
    let token;
    
    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('Permission refusée pour les notifications push !');
        return;
      }
      try {
        // Toujours lire le projectId depuis app.json (EAS) :
        // l'ancienne valeur codee en dur pointait vers un projet etranger.
        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          (Constants as any).easConfig?.projectId;
        if (!projectId) {
          console.warn('[Push] projectId EAS introuvable : token non demande');
          return;
        }
        token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      } catch (e) {
        console.log("Erreur lors de la récupération du token push:", e);
      }
    } else {
      console.log('Les notifications push nécessitent un appareil physique.');
    }

    return token;
  }

  async function savePushToken(token: string) {
    try {
      const user = await getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ push_token: token })
          .eq('user_id', user.id);
      }
    } catch (e) {
      console.log("Erreur sauvegarde token:", e);
    }
  }

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
    } catch (e) {
      console.log(e);
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
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error) {
        const ready = !!data;
        setProfileStatus(ready ? 'ready' : 'missing');
        void writeProfileCache(userId, ready);
        return;
      }

      console.warn(`[AuthFlow] checkProfile echec (${attempt}/2) : ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }

    // 3) Reseau toujours muet : sans cache, on laisse l'utilisateur entrer plutot
    //    que de lui imposer a tort l'ecran "Completer le profil".
    if (cached === null) {
      console.warn('[AuthFlow] statut profil indetermine -> acces autorise');
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

  if (!hasSeenOnboarding) {
    return <OnboardingScreen onComplete={() => setHasSeenOnboarding(true)} />;
  }

  if (!isAuthenticated) {
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
  if (profileStatus === 'unknown') {
    return loadingScreen;
  }

  if (profileStatus === 'missing') {
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
