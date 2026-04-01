import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, useColorScheme, Dimensions, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { supabase } from '@/lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Heart } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS, interpolate, Extrapolation } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

export default function MatchScreen() {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const themeColors = {
    text: isDark ? '#ffffff' : '#111827',
    textMuted: isDark ? '#9ca3af' : '#6b7280',
    bg: isDark ? '#111827' : '#f9fafb',
    card: isDark ? '#1f2937' : '#ffffff',
  };

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('user_id', user.id)
        .limit(20);

      if (error) throw error;
      
      const formatted = data?.map((p: any) => ({
        ...p,
        firstName: 'Membre' // Fallback si le prénom n'est pas dans la table public.profiles
      })) || [];
      
      setProfiles(formatted);
    } catch (error) {
      console.log('Error fetching potential matches', error);
    } finally {
      setLoading(false);
    }
  };

  const onSwipeComplete = (direction: 'left' | 'right') => {
    setCurrentIndex((prev) => prev + 1);
    translateX.value = 0;
    translateY.value = 0;
  };

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      if (translateX.value > SWIPE_THRESHOLD) {
        translateX.value = withSpring(SCREEN_WIDTH * 1.5, {}, () => {
          runOnJS(onSwipeComplete)('right');
        });
      } else if (translateX.value < -SWIPE_THRESHOLD) {
        translateX.value = withSpring(-SCREEN_WIDTH * 1.5, {}, () => {
          runOnJS(onSwipeComplete)('left');
        });
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const cardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
      [-10, 0, 10],
      Extrapolation.CLAMP
    );
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  const likeOpacity = useAnimatedStyle(() => {
    return {
      opacity: interpolate(translateX.value, [0, SCREEN_WIDTH / 4], [0, 1], Extrapolation.CLAMP),
    };
  });

  const nopeOpacity = useAnimatedStyle(() => {
    return {
      opacity: interpolate(translateX.value, [0, -SCREEN_WIDTH / 4], [0, 1], Extrapolation.CLAMP),
    };
  });

  const handleAction = (direction: 'left' | 'right') => {
    translateX.value = withSpring(direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5, {}, () => {
      runOnJS(onSwipeComplete)(direction);
    });
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: themeColors.bg }]}>
        <ActivityIndicator size="large" color="#f43f5e" />
      </View>
    );
  }

  const currentProfile = profiles[currentIndex];

  if (!currentProfile) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: themeColors.bg }]}>
        <View style={styles.emptyCircle}>
          <Heart color="#f43f5e" size={48} />
        </View>
        <Text style={[styles.emptyText, { color: themeColors.text }]}>Revenez plus tard</Text>
        <Text style={[styles.emptySub, { color: themeColors.textMuted }]}>
          Nous cherchons de nouveaux profils pour vous
        </Text>
      </View>
    );
  }

  const photoUri = currentProfile.photos?.[0] || 'https://via.placeholder.com/600x800';

  return (
    <GestureHandlerRootView style={[styles.safeArea, { backgroundColor: themeColors.bg }]}>
      <SafeAreaView style={styles.safeArea}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Découvrir</Text>
        </View>

        {/* Card Area */}
        <View style={styles.cardContainer}>
          <GestureDetector gesture={panGesture}>
            <Animated.View style={[styles.card, { backgroundColor: themeColors.card }, cardStyle]}>
              <Image 
                source={{ uri: photoUri }} 
                style={styles.image} 
                contentFit="cover"
                transition={300}
              />
              
              <Animated.View style={[styles.stamp, styles.stampLike, likeOpacity]}>
                <Text style={styles.stampTextLike}>LIKE</Text>
              </Animated.View>
              <Animated.View style={[styles.stamp, styles.stampNope, nopeOpacity]}>
                <Text style={styles.stampTextNope}>NOPE</Text>
              </Animated.View>

              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.8)']}
                style={styles.cardGradient}
              >
                <View style={styles.infoRow}>
                  <Text style={styles.name}>{currentProfile.firstName}</Text>
                  <Text style={styles.age}>{currentProfile.age}</Text>
                </View>
                <Text style={styles.city}>{currentProfile.city}</Text>
                
                <View style={styles.tagsRow}>
                  {currentProfile.blood_type && (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>{currentProfile.blood_type}</Text>
                    </View>
                  )}
                  {currentProfile.sickle_cell && (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>{currentProfile.sickle_cell}</Text>
                    </View>
                  )}
                </View>
              </LinearGradient>
            </Animated.View>
          </GestureDetector>
        </View>

        {/* Buttons */}
        <View style={styles.buttonsContainer}>
          <TouchableOpacity 
            style={[styles.actionBtn, styles.dislikeBtn]} 
            onPress={() => handleAction('left')}
            activeOpacity={0.8}
          >
            <X color="#ef4444" size={32} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionBtn, styles.likeBtn]} 
            onPress={() => handleAction('right')}
            activeOpacity={0.8}
          >
            <Heart color="#10b981" size={32} />
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: 'bold' },
  cardContainer: { flex: 1, padding: 16, justifyContent: 'center' },
  card: { flex: 1, borderRadius: 24, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 12 },
  image: { width: '100%', height: '100%', position: 'absolute' },
  cardGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24, paddingTop: 64 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 },
  name: { color: '#ffffff', fontSize: 28, fontWeight: 'bold', marginRight: 8 },
  age: { color: '#ffffff', fontSize: 24, fontWeight: '400' },
  city: { color: '#e5e7eb', fontSize: 16, marginBottom: 12 },
  tagsRow: { flexDirection: 'row', gap: 8 },
  tag: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  tagText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
  buttonsContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingBottom: 24, paddingTop: 16, gap: 24 },
  actionBtn: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 6 },
  dislikeBtn: { borderColor: '#ef4444', borderWidth: 1 },
  likeBtn: { borderColor: '#10b981', borderWidth: 1 },
  emptyCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(244,63,94,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  emptyText: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  emptySub: { fontSize: 16, textAlign: 'center' },
  stamp: { position: 'absolute', top: 60, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 4, transform: [{ rotate: '-15deg' }] },
  stampLike: { left: 40, borderColor: '#10b981' },
  stampTextLike: { color: '#10b981', fontSize: 28, fontWeight: 'bold', letterSpacing: 2 },
  stampNope: { right: 40, borderColor: '#ef4444', transform: [{ rotate: '15deg' }] },
  stampTextNope: { color: '#ef4444', fontSize: 28, fontWeight: 'bold', letterSpacing: 2 },
});
