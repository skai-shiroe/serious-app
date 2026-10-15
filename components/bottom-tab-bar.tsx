// Type depuis le fork bottom-tabs integre a expo-router (le type de
// @react-navigation/bottom-tabs natif diverge et casse le typecheck).
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Heart, MessageCircle, User, Zap, type LucideIcon } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUnreadMessagesCount } from '@/hooks/use-unread-count';

/**
 * Barre de navigation custom (« dock flottant ») :
 * - detachee des bords (marges + coins 28px + ombre douce) ;
 * - fond flou (expo-blur) sur iOS, translucide solide sur Android ;
 * - onglet actif : pastille rose animee (spring) + icone remplie blanche ;
 * - badge non-lus Messages custom (pastille rose, 99+), realtime via le
 *   hook existant useUnreadMessagesCount ;
 * - haptique leger au changement d'onglet, masquage au clavier.
 */

/** Teinte d'accent Geno (le rose du deck remonte dans la barre). */
const ACCENT = '#E91E63';

const TAB_ICONS: Record<string, LucideIcon> = {
  match: Heart,
  messages: MessageCircle,
  coaching: Zap,
  profile: User,
};

function TabItem({
  isFocused,
  label,
  Icon,
  badge,
  badgeBorderColor,
  inactiveColor,
  onPress,
}: {
  isFocused: boolean;
  label: string;
  Icon?: LucideIcon;
  badge?: string;
  badgeBorderColor: string;
  inactiveColor: string;
  onPress: () => void;
}) {
  const progress = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(isFocused ? 1 : 0, { damping: 16, stiffness: 220 });
  }, [isFocused, progress]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.6 + progress.value * 0.4 }],
  }));

  return (
    <TouchableOpacity
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
      activeOpacity={0.7}
      onPress={onPress}
      style={styles.item}
    >
      <View style={styles.iconWrap}>
        <Animated.View style={[styles.pill, pillStyle]} />
        {Icon ? (
          <Icon
            size={22}
            color={isFocused ? '#ffffff' : inactiveColor}
            fill={isFocused ? '#ffffff' : 'transparent'}
          />
        ) : null}
        {badge ? (
          <View style={[styles.badge, { borderColor: badgeBorderColor }]}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.label, { color: isFocused ? ACCENT : inactiveColor }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function BottomTabBar({ state, navigation, descriptors }: BottomTabBarProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const unreadCount = useUnreadMessagesCount();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const hide = useSharedValue(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
      hide.value = withTiming(1, { duration: 200 });
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      hide.value = withTiming(0, { duration: 200 });
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [hide]);

  const barAnimStyle = useAnimatedStyle(() => ({
    opacity: 1 - hide.value,
    transform: [{ translateY: hide.value * 140 }],
  }));

  return (
    <Animated.View
      pointerEvents={keyboardVisible ? 'none' : 'auto'}
      style={[
        styles.barWrap,
        {
          paddingBottom: Math.max(insets.bottom, 10),
          backgroundColor: isDark ? '#111827' : '#ffffff',
        },
      ]}
    >
      <Animated.View
        style={[
          styles.bar,
          isDark ? styles.barDark : styles.barLight,
          Platform.OS === 'ios' ? styles.barShadowIos : styles.barShadowAndroid,
          barAnimStyle,
        ]}
      >
        {Platform.OS === 'ios' ? (
          <BlurView intensity={55} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        ) : null}
        <View style={styles.row}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const label = typeof options.title === 'string' ? options.title : route.name;
            const isFocused = state.index === index;
            const Icon = TAB_ICONS[route.name];
            const badge =
              route.name === 'messages' && unreadCount > 0
                ? unreadCount >= 99
                  ? '99+'
                  : String(unreadCount)
                : undefined;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
              void Haptics.selectionAsync().catch(() => {});
            };

            return (
              <TabItem
                key={route.key}
                isFocused={isFocused}
                label={label}
                Icon={Icon}
                badge={badge}
                badgeBorderColor={isDark ? '#1f2937' : '#ffffff'}
                inactiveColor={isDark ? '#9ca3af' : '#6b7280'}
                onPress={onPress}
              />
            );
          })}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  barWrap: {
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  bar: {
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  barDark: { backgroundColor: '#1f2937', borderColor: 'rgba(255,255,255,0.10)' },
  barLight: { backgroundColor: '#ffffff', borderColor: 'rgba(15,23,42,0.08)' },
  barShadowIos: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },
  barShadowAndroid: { elevation: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 20,
  },
  iconWrap: {
    width: 44,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 17,
    backgroundColor: ACCENT,
  },
  label: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: '600',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f43f5e',
    borderWidth: 1.5,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
});
