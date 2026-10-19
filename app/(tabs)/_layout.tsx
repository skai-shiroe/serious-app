import { Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

import { BottomTabBar } from '@/components/bottom-tab-bar';
import { watchAppSetting } from '@/lib/app-settings';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [flags, setFlags] = useState<Record<string, boolean>>({ coaching: true });
  useEffect(() => {
    return watchAppSetting<Record<string, boolean>>('feature_flags', {}, (value) => {
      if (value) setFlags((current) => ({ ...current, ...value }));
    });
  }, []);

  return (
    <Tabs
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Teintes de repli si le tab bar custom n'est pas monte.
        tabBarActiveTintColor: '#E91E63',
        tabBarInactiveTintColor: isDark ? '#9ca3af' : '#6b7280',
      }}>
      <Tabs.Screen name="match" options={{ title: 'Match' }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
      <Tabs.Screen name="coaching" options={{ title: 'Coaching', href: flags.coaching === false ? null : undefined }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
    </Tabs>
  );
}
