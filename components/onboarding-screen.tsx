import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ImageSourcePropType,
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
import { watchAppSetting } from '@/lib/app-settings';

const { width } = Dimensions.get('window');

// Icône complète (fond Geno + wordmark) : contrairement au foreground blanc
// transparent, elle reste lisible sur les photos claires de l'onboarding.
const GENO_LOGO = require('@/assets/images/geno/android/play_store_512.png');

// Photos plein ecran, glissees vers une vraie premiere impression.
// 01 : le rire complice (joie, premier contact chaleureux).
const SLIDE_1_IMAGE = require('@/assets/images/rire_small.jpg');
// 02 : le regard intense (confiance, serieux de la compatibilite).
const SLIDE_2_IMAGE = require('@/assets/images/brxwn.jpeg');
// 03 : la famille heureuse sous le ciel (avenir protege, securite).
const SLIDE_3_IMAGE = require('@/assets/images/happy.jpeg');

type Slide = { image: ImageSourcePropType; title: string; description: string };
const DEFAULT_SLIDES: Slide[] = [
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
];
const LOCAL_SLIDE_IMAGES: Record<string, ImageSourcePropType> = {
  'local:rire_small.jpg': SLIDE_1_IMAGE,
  'local:brxwn.jpeg': SLIDE_2_IMAGE,
  'local:happy.jpeg': SLIDE_3_IMAGE,
};

// Fermeture douce d un haptique (no-op sur web / si indisp.).
function hapticTap() {
  Haptics.selectionAsync().catch(() => {});
}

/** Barre de progression unique (degrade Geno) : avance au doigt avec le
 *  pager — 1/3 pleine sur la premiere slide, pleine sur la derniere. */
function ProgressFill({ scrollX, total }: { scrollX: SharedValue<number>; total: number }) {
  const fillStyle = useAnimatedStyle(() => {
    const progress = Math.min(
      Math.max((scrollX.value + width) / (total * width), 0),
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
  const insets = useSafeAreaInsets();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slides, setSlides] = useState<Slide[]>(DEFAULT_SLIDES);
  // Index « immediatement a jour » (double-tap sur Suivant pendant
  // l animation de scroll, avant la synchro momentum-end).
  const currentSlideRef = useRef(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const scrollX = useSharedValue(0);

  useEffect(() => {
    return watchAppSetting<Array<{ title?: string; description?: string; image_url?: string }>>('onboarding_slides', [], (remote) => {
      if (!Array.isArray(remote) || remote.length === 0) return;
      const next = remote.filter((item) => item.title && item.description).map((item, index) => {
        const image = item.image_url?.startsWith('http')
          ? { uri: item.image_url }
          : LOCAL_SLIDE_IMAGES[item.image_url ?? ''] ?? DEFAULT_SLIDES[index % DEFAULT_SLIDES.length].image;
        return { image, title: item.title!, description: item.description! };
      });
      if (next.length) {
        setSlides(next);
        setCurrentSlide((current) => Math.min(current, next.length - 1));
        currentSlideRef.current = Math.min(currentSlideRef.current, next.length - 1);
      }
    });
  }, []);

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
  }, [slides.length]);

  // Le snap du pagingEnabled declenche momentum-end : on synchronise l index
  // (et le haptique) sur la position reelle du scroll, au doigt compris.
  const handleMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    if (index !== currentSlideRef.current && index >= 0 && index < slides.length) {
      currentSlideRef.current = index;
      setCurrentSlide(index);
      hapticTap();
    }
  }, [slides.length]);

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
      <View style={[styles.header, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Image source={GENO_LOGO} style={styles.headerLogo} contentFit="contain" />
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
        <ProgressFill scrollX={scrollX} total={slides.length} />

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
    paddingTop: 0,
  },
  headerLogo: {
    width: 36,
    height: 36,
    borderRadius: 11,
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
