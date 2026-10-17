import React, { useEffect } from 'react';
import { StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

type HeroProps = {
  source: ImageSourcePropType;
  title: string;
  description: string;
  index: number;
  slideTotal: number;
  isActive: boolean;
};

/** Photo plein ecran d une slide : cover + degrade sombre pour la lisibilite,
 *  pastille 01/03, titre + description (source unique, pas de doublon).
 *  L image « pop » au centrage (echelle 0.94 -> 1) et le voile monte en fondu. */
function Hero({ source, title, description, index, slideTotal, isActive }: HeroProps) {
  const overlayOpacity = useSharedValue(0);
  const pop = useSharedValue(0.94);

  useEffect(() => {
    overlayOpacity.value = withTiming(isActive ? 1 : 0, { duration: 360 });
    pop.value = withTiming(isActive ? 1 : 0.94, { duration: 520 });
  }, [isActive, overlayOpacity, pop]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));
  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }));

  const indicator =
    String(index + 1).padStart(2, '0') + ' / ' + String(slideTotal).padStart(2, '0');

  return (
    <View style={styles.container}>
      <Animated.View style={[StyleSheet.absoluteFill, popStyle]} pointerEvents="none">
        <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={280} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]} pointerEvents="none">
        <LinearGradient
          style={StyleSheet.absoluteFill}
          colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.82)']}
          locations={[0, 1]}
        />
      </Animated.View>

      <View style={styles.content} pointerEvents="none">
        <Animated.View entering={FadeInDown.delay(60).duration(500)} style={styles.pill}>
          <Text style={styles.pillText}>{indicator}</Text>
        </Animated.View>
        <Animated.Text entering={FadeInDown.delay(160).duration(500)} style={styles.title}>
          {title}
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(280).duration(500)} style={styles.description}>
          {description}
        </Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Hauteur heritee du pager (FlatList horizontale : items etires en hauteur).
  container: {
    flex: 1,
    backgroundColor: '#0b1020',
  },
  content: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 24,
    // Footer (progression + bouton) ≈ 120px + 50px d air : le bloc de texte
    // se pose au-dessus sans jamais chevaucher la barre.
    paddingBottom: 125,
  },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 8,
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
    textAlign: 'left',
  },
  description: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
    textAlign: 'left',
    maxWidth: 360,
  },
});

export default Hero;
