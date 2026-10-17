import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Reply } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

/**
 * Swipe-pour-repondre facon WhatsApp : un drag horizontal sur une bulle
 * declenche `onReply`, avec resistance, haptique et retour elastique.
 * Le scroll vertical de la FlatList garde la priorite (failOffsetY).
 */

const TRIGGER_PX = 55;
const MAX_DRAG_PX = 90;

type Props = {
  children: React.ReactNode;
  onReply: () => void;
  disabled?: boolean;
  /** 'right' : on tire vers la droite (bulles recues, a gauche). */
  direction?: 'left' | 'right';
};

export function SwipeToReply({ children, onReply, disabled, direction = 'right' }: Props) {
  const translateX = useSharedValue(0);

  const fireReply = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    onReply();
  }, [onReply]);

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetX([-15, 15])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      let x = Math.max(-MAX_DRAG_PX, Math.min(MAX_DRAG_PX, e.translationX));
      // On ne garde que le sens voulu (vers l'interieur, comme WhatsApp).
      x = direction === 'right' ? Math.max(0, x) : Math.min(0, x);
      translateX.value = x;
    })
    .onEnd(() => {
      if (Math.abs(translateX.value) >= TRIGGER_PX) {
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
        runOnJS(fireReply)();
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const iconStyle = useAnimatedStyle(() => {
    const p = Math.min(Math.abs(translateX.value) / TRIGGER_PX, 1);
    return {
      opacity: p,
      transform: [{ scale: 0.6 + 0.4 * p }],
    };
  });

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.icon,
          direction === 'right' ? styles.iconLeft : styles.iconRight,
          iconStyle,
        ]}
        pointerEvents="none"
      >
        <Reply size={20} color="#9ca3af" />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={bubbleStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    justifyContent: 'center',
  },
  icon: {
    position: 'absolute',
    top: '50%',
    marginTop: -12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLeft: { left: 10 },
  iconRight: { right: 10 },
});
