import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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

import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { OnboardingScreen } from '@/components/onboarding-screen';
import AuthScreen from '@/components/auth-screen';
import ProfileCreation from '@/components/profile-creation';
import { ProfileSheetProvider, useProfileSheet } from '@/contexts/ProfileSheetContext';

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
        <BottomSheetView />
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
              source={{ uri: photo }} 
              style={{ width: SCREEN_WIDTH, height: 450 }} 
              contentFit="cover" 
            />
          ))}
        </ScrollView>

        <View style={{ padding: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 32, fontWeight: 'bold', color: isDark ? '#fff' : '#111827' }}>
                {selectedProfile.first_name}
              </Text>
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

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
            <View style={{ backgroundColor: 'rgba(244,63,94,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
              <Text style={{ color: '#f43f5e', fontWeight: 'bold' }}>{selectedProfile.blood_type}</Text>
            </View>
            <View style={{ backgroundColor: 'rgba(59,130,246,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
              <Text style={{ color: '#3b82f6', fontWeight: 'bold' }}>Drépanocytose : {selectedProfile.sickle_cell}</Text>
            </View>
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
  const [isReady, setIsReady] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasCompletedProfile, setHasCompletedProfile] = useState(false);

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
      if (session?.user) {
        setHasSeenOnboarding(true);
        setIsAuthenticated(true);
        checkProfile(session.user.id);
      } else {
        setIsAuthenticated(false);
        setHasCompletedProfile(false);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const checkAuthState = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setHasSeenOnboarding(true);
        setIsAuthenticated(true);
        await checkProfile(session.user.id);
      }
    } catch (e) {
      console.log(e);
    } finally {
      setIsReady(true);
    }
  };

  const checkProfile = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', userId)
        .single();
        
      if (data) setHasCompletedProfile(true);
      else setHasCompletedProfile(false);
    } catch (e) {
      setHasCompletedProfile(false);
    }
  };

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colorScheme === 'dark' ? '#111827' : '#f9fafb' }}>
        <ActivityIndicator size="large" color="#f43f5e" />
      </View>
    );
  }

  if (!hasSeenOnboarding) {
    return <OnboardingScreen onComplete={() => setHasSeenOnboarding(true)} />;
  }

  if (!isAuthenticated) {
    return <AuthScreen onComplete={() => setIsAuthenticated(true)} />;
  }

  if (!hasCompletedProfile) {
    return <ProfileCreation onComplete={() => setHasCompletedProfile(true)} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ProfileSheetProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
          <StatusBar style="auto" />
          <ProfileBottomSheet />
        </ThemeProvider>
      </ProfileSheetProvider>
    </GestureHandlerRootView>
  );
}
