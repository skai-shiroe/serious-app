import React from 'react';
import { StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = require('react-native').Dimensions.get('window');

type HeroProps = {
  source: ImageSourcePropType;
  title: string;
  description: string;
  index: number;
  slideTotal: number;
  isActive: boolean;
};

function Hero({ source, title, description, index, slideTotal, isActive }: HeroProps) {
  const overlayOpacity = useSharedValue(0);
  const pop = useSharedValue(1);

  React.useEffect(() => {
    if (isActive) {
      overlayOpacity.value = withTiming(1, { duration: 360 });
      pop.value = withTiming(1, { duration: 520 });
    }
  }, [isActive]);

  const container = useAnimatedStyle(() => ({
    opacity: isActive ? 1 : 0.92,
  }));

  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[StyleSheet.absoluteFill, container]} pointerEvents="none">
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={280}
          defaultSource={require('../assets/images/rire_small.jpg')}
        />
        <LinearGradient
          style={StyleSheet.absoluteFill}
          colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.82)']}
          locations={[0, 1]}
        />
        <View style={styles.overlayIndicator}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>
              {String(index + 1).padStart(2, '0')} / {String(slideTotal).padStart(2, '0')}
            </Text>
          </View>
        </View>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, heroStyle]} pointerEvents="none">
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1020',
  },
  overlayIndicator: {
    position: 'absolute',
    top: 28,
    alignSelf: 'center',
    left: 20,
    right: 20,
  },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  title: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
    paddingTop: 28,
    paddingBottom: 8,
  },
  description: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
    textAlign: 'center',
    paddingHorizontal: 32,
    maxWidth: 360,
  },
});

export default Hero;
