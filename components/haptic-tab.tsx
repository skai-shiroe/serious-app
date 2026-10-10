import * as Haptics from 'expo-haptics';
import type { ComponentProps } from 'react';
import { Pressable } from 'react-native';

/**
 * Bouton d'onglet avec retour haptique (iOS).
 * Depuis SDK 56, expo-router embarque react-navigation : importer
 * `PlatformPressable` depuis `@react-navigation/elements` fait echouer le
 * bundling. On utilise `Pressable` natif, de comportement equivalent ici.
 */
export function HapticTab(props: ComponentProps<typeof Pressable>) {
  return (
    <Pressable
      {...props}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === 'ios') {
          // Add a soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
