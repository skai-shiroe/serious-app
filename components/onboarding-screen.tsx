import { SafeAreaView } from 'react-native-safe-area-context';
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
    type NativeScrollEvent,
    type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, {
    FadeIn,
    FadeInDown,
    type SharedValue,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import { Button } from './ui/button';
import { LofiIllustration, LOFI_STAGE } from './lofi-illustration';
import { LOFI_DNA_SVG, LOFI_HEART_SVG, LOFI_PRIVACY_SVG, LOFI_SEARCH_SVG } from '@/lib/lofi-svgs';

const { width } = Dimensions.get('window');

// Wordmark Geno (foreground adaptif : blanc transparent) — la marque est
// visible des la premiere slide de la premiere ouverture.
const GENO_WORDMARK = require('@/assets/images/geno/android/res/mipmap-xxxhdpi/geno_foreground.png');

interface OnboardingScreenProps {
    onComplete: () => void;
}

const slides = [
    {
        art: LOFI_HEART_SVG,
        title: 'Rencontre Sérieuse',
        description: 'Trouvez un partenaire compatible qui partage vos valeurs et vos aspirations pour une relation authentique et durable.',
        colors: ['#fb7185', '#f472b6'] as const // rose-400 to pink-400
    },
    {
        art: LOFI_SEARCH_SVG,
        title: 'Découverte Ciblée',
        description: 'Affinez votre recherche avec nos filtres (âge, ville) et découvrez uniquement des profils qui correspondent à vos envies.',
        colors: ['#fbbf24', '#fb923c'] as const // amber-400 to orange-400
    },
    {
        art: LOFI_DNA_SVG,
        title: 'Compatibilité Médicale',
        description: 'Prenez des décisions éclairées grâce à notre système de compatibilité basé sur le groupe sanguin et le statut drépanocytaire.',
        colors: ['#60a5fa', '#22d3ee'] as const // blue-400 to cyan-400
    },
    {
        art: LOFI_PRIVACY_SVG,
        title: 'Confidentialité Totale',
        description: 'Vos données médicales et personnelles sont protégées avec les plus hauts standards de sécurité et de confidentialité.',
        colors: ['#c084fc', '#818cf8'] as const // purple-400 to indigo-400
    }
];

type Slide = (typeof slides)[number];

// Fermeture douce d'un haptique (no-op sur web / si indisp.).
function hapticTap() {
    Haptics.selectionAsync().catch(() => {});
}

// Distance normalisee de la slide au centre de l'ecran : 1 = centree,
// 0 = decalee d'un ecran entier. Sert aux styles pilotes par le scroll.
function closenessOf(scrollX: SharedValue<number>, index: number) {
    'worklet';
    return 1 - Math.min(Math.abs(scrollX.value - index * width) / width, 1);
}

/** Couche de fond d'une slide : lavis de couleur + deux orbes flottants.
 *  L'opacite suit le scroll au doigt (crossfade 1:1 pendant le swipe). */
function SlideBackground({ item, index, scrollX, floatY }: {
    item: Slide;
    index: number;
    scrollX: SharedValue<number>;
    floatY: SharedValue<number>;
}) {
    const layerStyle = useAnimatedStyle(() => ({
        opacity: closenessOf(scrollX, index),
    }));
    const floatStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: floatY.value }],
    }));

    return (
        <Animated.View style={[StyleSheet.absoluteFill, layerStyle]} pointerEvents="none">
            <Animated.View style={[StyleSheet.absoluteFill, floatStyle]}>
                <LinearGradient colors={item.colors} style={[StyleSheet.absoluteFill, styles.wash]} />
                <LinearGradient colors={item.colors} style={[styles.orb, styles.orbTop]} />
                <LinearGradient colors={item.colors} style={[styles.orb, styles.orbBottom]} />
            </Animated.View>
        </Animated.View>
    );
}

/** Contenu d'une slide : entree en cascade au montage, puis animations
 *  pilotees par le scroll — l'illustration « pop » au centrage (echelle +
 *  rotation + respiration continue) et les textes fondent selon la distance. */
function OnboardingSlide({ item, index, scrollX, currentSlide }: {
    item: Slide;
    index: number;
    scrollX: SharedValue<number>;
    currentSlide: number;
}) {

    const textFadeStyle = useAnimatedStyle(() => ({
        opacity: 0.25 + 0.75 * closenessOf(scrollX, index),
    }));
    const iconPopStyle = useAnimatedStyle(() => {
        const closeness = closenessOf(scrollX, index);
        return {
            transform: [
                { scale: 0.86 + 0.14 * closeness },
                { rotate: `${(1 - closeness) * -12}deg` },
            ],
        };
    });

    // Respiration continue de l'icone (legere, appreciable au repos).
    const pulse = useSharedValue(1);
    useEffect(() => {
        pulse.value = withRepeat(withTiming(1.04, { duration: 1400 }), -1, true);
    }, [pulse]);
    const pulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulse.value }],
    }));

    return (
        <View style={styles.slide}>
            <Animated.View entering={FadeInDown.delay(60).duration(500)}>
                <Animated.View style={iconPopStyle}>
                    <Animated.View style={pulseStyle}>
                        {/* Illustration SVG animee (SMIL via WebView) : montee
                            uniquement pour la slide active et ses voisines. */}
                        {Math.abs(index - currentSlide) <= 1 ? (
                            <LofiIllustration xml={item.art} />
                        ) : (
                            <View style={styles.artPlaceholder} />
                        )}
                    </Animated.View>
                </Animated.View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                <Animated.View style={textFadeStyle}>
                    <Text style={styles.title}>{item.title}</Text>
                </Animated.View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(320).duration(500)}>
                <Animated.View style={textFadeStyle}>
                    <Text style={styles.description}>{item.description}</Text>
                </Animated.View>
            </Animated.View>
        </View>
    );
}

/** Barre de progression unique (degrade Geno) : avance au doigt avec le
 *  pager — 1/3 pleine sur la premiere slide, pleine sur la derniere. */
function ProgressFill({ scrollX }: { scrollX: SharedValue<number> }) {
    const fillStyle = useAnimatedStyle(() => {
        const progress = Math.min(Math.max((scrollX.value + width) / (slides.length * width), 0), 1);
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

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
    const [currentSlide, setCurrentSlide] = useState(0);
    // Index « immediatement a jour » (double-tap sur Suivant pendant
    // l'animation de scroll, avant la synchro momentum-end).
    const currentSlideRef = useRef(0);
    const listRef = useRef<FlatList<Slide>>(null);
    const scrollX = useSharedValue(0);
    const floatY = useSharedValue(0);

    // Derive lente des orbes de fond.
    useEffect(() => {
        floatY.value = withRepeat(withTiming(-16, { duration: 3200 }), -1, true);
    }, [floatY]);

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

    // Le snap du pagingEnabled declenche momentum-end : on synchronise l'index
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
        <OnboardingSlide item={item} index={index} scrollX={scrollX} currentSlide={currentSlide} />
    );

    return (
        <SafeAreaView style={styles.container}>
            {/* Fond vivant : lavis + orbes par slide, crossfade pendant le swipe. */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
                {slides.map((item, index) => (
                    <SlideBackground
                        key={index}
                        item={item}
                        index={index}
                        scrollX={scrollX}
                        floatY={floatY}
                    />
                ))}
            </View>

            {/* Marque Geno visible des la premiere slide + bouton Passer. */}
            <View style={styles.header}>
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

            {/* Pager swipable : le contenu suit le doigt 1:1, les styles
                animes (pop de l'icone, fondu des textes) suivent en direct. */}
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
        backgroundColor: '#ffffff',
    },
    pager: {
        flex: 1,
    },
    slide: {
        width,
        paddingHorizontal: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Lavis de couleur discret sur toute la surface de la slide active.
    wash: {
        opacity: 0.14,
    },
    // Orbes flottants : deux taches de couleur aux opposes de l'ecran.
    orb: {
        position: 'absolute',
        borderRadius: 999,
        opacity: 0.2,
    },
    orbTop: {
        width: 260,
        height: 260,
        top: -90,
        right: -80,
    },
    orbBottom: {
        width: 220,
        height: 220,
        bottom: -70,
        left: -70,
    },
    header: {
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
        color: '#6b7280', // gray-500
        fontSize: 16,
        fontWeight: '500',
    },
    // Placeholder de scene quand la WebView de l'illustration n'est pas
    // montee (slide eloignee) : garde la mise en page stable.
    artPlaceholder: {
        width: LOFI_STAGE.width,
        height: LOFI_STAGE.height,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: '#111827', // gray-900
        marginBottom: 10,
        textAlign: 'center',
    },
    description: {
        fontSize: 16,
        color: '#4b5563', // gray-600
        textAlign: 'center',
        lineHeight: 24,
        maxWidth: 320,
    },
    footer: {
        paddingHorizontal: 32,
        paddingBottom: 28,
        gap: 24,
    },
    // Barre de progression : piste pleine largeur, remplissage anime.
    progressTrack: {
        height: 6,
        borderRadius: 3,
        backgroundColor: '#fee2e2', // rose-100
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
    }
});
