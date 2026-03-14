import { LinearGradient } from 'expo-linear-gradient';
import { Activity, ChevronRight, Heart, Shield } from 'lucide-react-native';
import React, { useState } from 'react';
import { Dimensions, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
    LinearTransition,
    SlideInRight,
    SlideOutLeft
} from 'react-native-reanimated';
import { Button } from './ui/button';

const { width } = Dimensions.get('window');

interface OnboardingScreenProps {
    onComplete: () => void;
}

const slides = [
    {
        icon: Heart,
        title: 'Rencontre Sérieuse',
        description: 'Trouvez un partenaire compatible qui partage vos valeurs et vos aspirations pour une relation authentique et durable.',
        colors: ['#fb7185', '#f472b6'] as const // rose-400 to pink-400
    },
    {
        icon: Activity,
        title: 'Compatibilité Médicale',
        description: 'Prenez des décisions éclairées grâce à notre système de compatibilité basé sur le groupe sanguin et le statut drépanocytaire.',
        colors: ['#60a5fa', '#22d3ee'] as const // blue-400 to cyan-400
    },
    {
        icon: Shield,
        title: 'Confidentialité Totale',
        description: 'Vos données médicales et personnelles sont protégées avec les plus hauts standards de sécurité et de confidentialité.',
        colors: ['#c084fc', '#818cf8'] as const // purple-400 to indigo-400
    }
];

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
    const [currentSlide, setCurrentSlide] = useState(0);

    const handleNext = () => {
        if (currentSlide < slides.length - 1) {
            setCurrentSlide(currentSlide + 1);
        } else {
            onComplete();
        }
    };

    const handleSkip = () => {
        onComplete();
    };

    const slide = slides[currentSlide];
    const Icon = slide.icon;

    return (
        <SafeAreaView style={styles.container}>
            {/* Skip Button */}
            <View style={styles.header}>
                <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
                    <Text style={styles.skipText}>Passer</Text>
                </TouchableOpacity>
            </View>

            {/* Content */}
            <View style={styles.content}>
                {/* We use a key trick to force re-render and trigger enter/exit animations */}
                <Animated.View
                    key={currentSlide}
                    entering={SlideInRight.duration(300)}
                    exiting={SlideOutLeft.duration(300)}
                    style={styles.slideContainer}
                >
                    {/* Icon */}
                    <LinearGradient
                        colors={slide.colors}
                        style={styles.iconContainer}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    >
                        <Icon width={64} height={64} color="#ffffff" strokeWidth={1.5} />
                    </LinearGradient>

                    {/* Title */}
                    <Text style={styles.title}>
                        {slide.title}
                    </Text>

                    {/* Description */}
                    <Text style={styles.description}>
                        {slide.description}
                    </Text>
                </Animated.View>
            </View>

            {/* Bottom Section */}
            <View style={styles.footer}>
                {/* Dots Indicator */}
                <View style={styles.dotsContainer}>
                    {slides.map((_, index) => (
                        <Animated.View
                            key={index}
                            layout={LinearTransition}
                            style={[
                                styles.dot,
                                index === currentSlide ? styles.dotActive : styles.dotInactive
                            ]}
                        />
                    ))}
                </View>

                {/* Next Button */}
                <Button
                    onPress={handleNext}
                    colors={['#f43f5e', '#ec4899']}
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
    header: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingHorizontal: 24,
        paddingTop: 16,
    },
    skipButton: {
        padding: 8,
    },
    skipText: {
        color: '#6b7280', // gray-500
        fontSize: 16,
        fontWeight: '500',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    slideContainer: {
        alignItems: 'center',
        width: '100%',
    },
    iconContainer: {
        width: 128,
        height: 128,
        borderRadius: 64,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 40,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 8,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: '#111827', // gray-900
        marginBottom: 16,
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
        paddingBottom: 40,
        gap: 32,
    },
    dotsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    dot: {
        height: 8,
        borderRadius: 4,
    },
    dotActive: {
        width: 32,
        backgroundColor: '#f43f5e', // rose-500
    },
    dotInactive: {
        width: 8,
        backgroundColor: '#e5e7eb', // gray-200
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
