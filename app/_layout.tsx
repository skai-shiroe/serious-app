import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

import { OnboardingScreen } from '@/components/onboarding-screen';
import { useState } from 'react';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

  if (!hasSeenOnboarding) {
    return <OnboardingScreen onComplete={() => setHasSeenOnboarding(true)} />;
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
