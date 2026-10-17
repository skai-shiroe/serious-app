import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight } from 'lucide-react-native';
import React, { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  SharedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { Button } from './ui/button';
import Hero from './onboarding-hero';

const { width } = Dimensions.get('window');

// Wordmark Geno (foreground adaptif : blanc transparent) — la marque est
// visible des la premiere slide de la premiere ouverture.
const GENO_WORDMARK = require('@/assets/images/geno/android/res/mipmap-xxxhdpi/geno_foreground.png');

// Photos plein ecran, glissees vers une vraie premiere impression.
// 01 : le rire complice (joie, premier contact chaleureux).
const SLIDE_1_IMAGE = require('@/assets/images/rire_small.jpg');
// 02 : le regard intense (confiance, serieux de la compatibilite).
const SLIDE_2_IMAGE = require('@/assets/images/brxwn.jpeg');
// 03 : la famille heureuse sous le ciel (avenir protege, securite).
const SLIDE_3_IMAGE = require('@/assets/images/happy.jpeg');

const slides = [
  {
    image: SLIDE_1_IMAGE,
    title: 'Rencontre Sérieuse',
    description:
      'Trouve un partenaire compatible qui partage tes valeurs et tes aspirations pour une relation authentique et durable.',
  },
  {
    image: SLIDE_2_IMAGE,
    title: 'Compatibilité Médicale',
    description:
      'Prends des decisions informées grâce a notre système de compatibilité basé sur le groupe sanguin et le statut drépanocytaire.',
  },
  {
    image: SLIDE_3_IMAGE,
    title: 'Confidentialité Totale',
    description:
      'Tes données médicales et personnelles sont protégées avec les plus hauts standards de sécurité et de confidentialité.',
  },
] as const;

type Slide = (typeof slides)[number];

// Fermeture douce d un haptique (no-op sur web / si indisp.).
function hapticTap() {
  Haptics.selectionAsync().catch(() => {});
}

/** Barre de progression unique (degrade Geno) : avance au doigt avec le
 *  pager — 1/3 pleine sur la premiere slide, pleine sur la derniere. */
function ProgressFill({ scrollX }: { scrollX: SharedValue<number> }) {
  const fillStyle = useAnimatedStyle(() => {
    const progress = Math.min(
      Math.max((scrollX.value + width) / (slides.length * width), 0),
      1,
    );
    return { width: progress * (width - 64) };
  });

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, fillStyle]}>
        <LinearGradient
          colors={['#f43f5e', '#ec4899']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.progressGradient}
        />
      </Animated.View>
    </View>
  );
}

export function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  // Index « immediatement a jour » (double-tap sur Suivant pendant
  // l animation de scroll, avant la synchro momentum-end).
  const currentSlideRef = useRef(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const scrollX = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  const goTo = useCallback((index: number) => {
    const target = Math.max(0, Math.min(index, slides.length - 1));
    if (target !== currentSlideRef.current) {
      currentSlideRef.current = target;
      setCurrentSlide(target);
      hapticTap();
    }
    listRef.current?.scrollToOffset({ offset: target * width, animated: true });
  }, []);

  // Le snap du pagingEnabled declenche momentum-end : on synchronise l index
  // (et le haptique) sur la position reelle du scroll, au doigt compris.
  const handleMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    if (index !== currentSlideRef.current && index >= 0 && index < slides.length) {
      currentSlideRef.current = index;
      setCurrentSlide(index);
      hapticTap();
    }
  }, []);

  const handleNext = () => {
    if (currentSlideRef.current < slides.length - 1) goTo(currentSlideRef.current + 1);
    else onComplete();
  };

  const handleSkip = () => onComplete();

  const renderSlide = ({ item, index }: { item: Slide; index: number }) => (
    <View style={styles.slide}>
      <Hero
        source={item.image}
        title={item.title}
        description={item.description}
        index={index}
        slideTotal={slides.length}
        isActive={index === currentSlide}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Pager swipable : chaque slide est une photo plein-bleed (Hero).
          Les items heritent de la hauteur du pager (alignItems stretch). */}
      <Animated.FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(_, index) => String(index)}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        onMomentumScrollEnd={handleMomentumEnd}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        initialNumToRender={slides.length}
        windowSize={slides.length}
        style={styles.pager}
      />

      {/* Marque Geno + bouton Passer, en surimpression sur la photo. */}
      <View style={styles.header} pointerEvents="box-none">
        <Image source={GENO_WORDMARK} style={styles.headerLogo} contentFit="contain" />
        <TouchableOpacity
          onPress={handleSkip}
          style={styles.skipButton}
          accessibilityRole="button"
          accessibilityLabel="Passer l'introduction"
        >
          <Animated.View entering={FadeIn.delay(150).duration(400)}>
            <Text style={styles.skipText}>Passer</Text>
            
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* Bottom Section */}
      <View style={styles.footer}>
        <ProgressFill scrollX={scrollX} />

        {/* Next Button */}
        <Button
          onPress={handleNext}
          colors={['#f43f5e', '#ec4899']}
          accessibilityRole="button"
          accessibilityLabel={currentSlide < slides.length - 1 ? 'Suivant' : 'Commencer'}
        >
          <View style={styles.buttonContent}>
            <Text style={styles.buttonText}>
              {currentSlide < slides.length - 1 ? 'Suivant' : 'Commencer'}
            </Text>
            <ChevronRight width={20} height={20} color="#ffffff" />
          </View>
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1020',
  },
  pager: {
    flex: 1,
  },
  // Chaque item occupe la largeur d ecran et toute la hauteur du pager :
  // Hero (flex:1 + absoluteFill) a ainsi une reference de taille reelle.
  slide: {
    width,
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  headerLogo: {
    width: 40,
    height: 40,
  },
  skipButton: {
    padding: 8,
  },
  skipText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    fontWeight: '500',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 32,
    paddingBottom: 28,
    gap: 24,
  },
  // Barre de progression : piste pleine largeur, remplissage anime.
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressGradient: {
    width: width - 64,
    height: 6,
    borderRadius: 3,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
