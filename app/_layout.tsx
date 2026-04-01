import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

import { OnboardingScreen } from '@/components/onboarding-screen';
import AuthScreen from '@/components/auth-screen';
import ProfileCreation from '@/components/profile-creation';
import { useState, useEffect } from 'react';
import { ActivityIndicator, View, Appearance } from 'react-native';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isReady, setIsReady] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasCompletedProfile, setHasCompletedProfile] = useState(false);

  useEffect(() => {
    const initTheme = async () => {
      try {
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
        setHasSeenOnboarding(true); // On skip l'onboarding pour un utilisateur connecté
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
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', userId)
        .single();
        
      if (data) {
        setHasCompletedProfile(true);
      } else {
        setHasCompletedProfile(false);
      }
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
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
