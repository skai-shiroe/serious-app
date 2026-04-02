import { supabase } from '@/lib/supabase';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Filter, Heart, MapPin, X, Info, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, Dimensions, Modal, StyleSheet, Text, TouchableOpacity, useColorScheme, View, ScrollView } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS, interpolate, Extrapolation, withTiming, FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useProfileSheet } from '@/contexts/ProfileSheetContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const SICKLE_CELL_STATUS = [
  { label: 'AA', value: 'AA' },
  { label: 'AS', value: 'AS' },
  { label: 'SS', value: 'SS' },
  { label: 'Inconnu', value: 'inconnu' },
];

export default function MatchScreen() {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [showMatch, setShowMatch] = useState<any>(null);
  const [filterVisible, setFilterVisible] = useState(false);
  const [filters, setFilters] = useState({
    ageMin: 18,
    ageMax: 50,
    city: '',
    bloodType: '',
    sickleCell: '',
  });

  const { openProfileSheet } = useProfileSheet();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const themeColors = {
    text: isDark ? '#ffffff' : '#111827',
    textMuted: isDark ? '#9ca3af' : '#6b7280',
    bg: isDark ? '#111827' : '#f9fafb',
    card: isDark ? '#1f2937' : '#ffffff',
    bgCard: isDark ? '#1f2937' : '#ffffff',
    inputBg: isDark ? '#374151' : '#f3f4f6',
    border: isDark ? '#374151' : '#e5e7eb',
    accent: '#f43f5e',
  };

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const calculateAge = (birthDateStr: string) => {
    if (!birthDateStr) return null;
    const birthDate = new Date(birthDateStr);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const fetchProfiles = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: swipedData } = await supabase
        .from('swipes')
        .select('swiped_id')
        .eq('swiper_id', user.id);
      
      const swipedIds = swipedData?.map(s => s.swiped_id) || [];
      swipedIds.push(user.id);

      let query = supabase
        .from('profiles')
        .select('*');

      if (swipedIds.length > 0) {
        query = query.filter('user_id', 'not.in', `(${swipedIds.join(',')})`);
      }

      if (filters.city) {
        query = query.ilike('city', `%${filters.city}%`);
      }
      if (filters.bloodType) {
        query = query.eq('blood_type', filters.bloodType);
      }
      if (filters.sickleCell) {
        query = query.eq('sickle_cell', filters.sickleCell);
      }

      const { data, error } = await query.limit(30);

      if (error) {
        console.error('Fetch profiles error:', error);
        throw error;
      }
      
      const filtered = data?.filter(p => {
        const age = calculateAge(p.birth_date);
        if (!age) return true;
        return age >= filters.ageMin && age <= filters.ageMax;
      }) || [];
      
      setProfiles(filtered);
      setCurrentIndex(0);
      setCurrentPhotoIndex(0);
    } catch (error) {
      console.log('Error fetching potential matches', error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const onSwipeComplete = (direction: 'left' | 'right') => {
    const swipedProfile = profiles[currentIndex];
    if (!swipedProfile) return;

    setCurrentIndex((prev) => prev + 1);
    setCurrentPhotoIndex(0);
    translateX.value = 0;
    translateY.value = 0;

    (async () => {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (!currentUser) return;

        const swipeDir = direction === 'right' ? 'like' : 'dislike';
        
        await supabase.from('swipes').insert({
          swiper_id: currentUser.id,
          swiped_id: swipedProfile.user_id,
          direction: swipeDir
        });

        if (swipeDir === 'like') {
          const { data: matchData } = await supabase
            .from('matches')
            .select('*')
            .or(`and(user_id_1.eq.${currentUser.id},user_id_2.eq.${swipedProfile.user_id}),and(user_id_1.eq.${swipedProfile.user_id},user_id_2.eq.${currentUser.id})`)
            .maybeSingle();

          if (matchData) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setShowMatch({
              me: currentUser,
              partner: swipedProfile
            });
          } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      } catch (err) {
        console.error('Background swipe error:', err);
      }
    })();
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

  const tapGesture = Gesture.Tap()
    .onEnd((event) => {
      const x = event.x;
      const cardWidth = SCREEN_WIDTH - 32;
      const profile = profiles[currentIndex];
      if (!profile || !profile.photos) return;

      if (x < cardWidth * 0.3) {
        // Tap gauche -> photo précédente
        if (currentPhotoIndex > 0) {
          runOnJS(setCurrentPhotoIndex)(currentPhotoIndex - 1);
        }
      } else if (x > cardWidth * 0.7) {
        // Tap droite -> photo suivante
        if (currentPhotoIndex < profile.photos.length - 1) {
          runOnJS(setCurrentPhotoIndex)(currentPhotoIndex + 1);
        }
      } else {
        // Tap centre -> détails
        runOnJS(openProfileSheet)(profile);
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

  if (loading && profiles.length === 0) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: themeColors.bg }]}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  const currentProfile = profiles[currentIndex];
  const nextProfile = profiles[currentIndex + 1];

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.bg }]}>
        
        <View style={styles.header}>
          <View>
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>Découvrir</Text>
            <Text style={[styles.headerSub, { color: themeColors.textMuted }]}>Trouvez votre compatibilité</Text>
          </View>
          <TouchableOpacity 
            style={[styles.filterBtn, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
            onPress={() => setFilterVisible(true)}
          >
            <Filter color={themeColors.text} size={20} />
          </TouchableOpacity>
        </View>

        <View style={styles.cardContainer}>
          {nextProfile && (
            <View style={[styles.card, styles.nextCard, { backgroundColor: themeColors.card }]}>
               <Image 
                source={{ uri: nextProfile.photos?.[0] || 'https://via.placeholder.com/600x800' }} 
                style={styles.image} 
                contentFit="cover"
              />
            </View>
          )}

          {currentProfile ? (
            <GestureDetector gesture={Gesture.Exclusive(panGesture, tapGesture)}>
              <Animated.View style={[styles.card, { backgroundColor: themeColors.card }, cardStyle]}>
                <Image 
                  source={{ uri: currentProfile.photos?.[currentPhotoIndex] || 'https://via.placeholder.com/600x800' }} 
                  style={styles.image} 
                  contentFit="cover"
                  transition={200}
                />
                
                {/* Pagination Dots */}
                {currentProfile.photos && currentProfile.photos.length > 1 && (
                  <View style={styles.paginationDots}>
                    {currentProfile.photos.map((_: any, i: number) => (
                      <View 
                        key={i} 
                        style={[
                          styles.dot, 
                          i === currentPhotoIndex ? styles.activeDot : styles.inactiveDot
                        ]} 
                      />
                    ))}
                  </View>
                )}

                <Animated.View style={[styles.stamp, styles.stampLike, likeOpacity]}>
                  <Text style={styles.stampTextLike}>LIKE</Text>
                </Animated.View>
                <Animated.View style={[styles.stamp, styles.stampNope, nopeOpacity]}>
                  <Text style={styles.stampTextNope}>NOPE</Text>
                </Animated.View>

                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.9)']}
                  style={styles.cardGradient}
                >
                  <View style={styles.infoRow}>
                    <Text style={styles.name}>{currentProfile.first_name}</Text>
                    <Text style={styles.age}>{calculateAge(currentProfile.birth_date)}</Text>
                  </View>
                  <View style={styles.locationRow}>
                    <MapPin color="#e5e7eb" size={16} />
                    <Text style={styles.city}>{currentProfile.city}</Text>
                  </View>
                  
                  <View style={styles.tagsRow}>
                    <View style={[styles.tag, { backgroundColor: 'rgba(244,63,94,0.3)' }]}>
                      <Text style={styles.tagText}>{currentProfile.blood_type}</Text>
                    </View>
                    <View style={[styles.tag, { backgroundColor: 'rgba(59,130,246,0.3)' }]}>
                      <Text style={styles.tagText}>{currentProfile.sickle_cell}</Text>
                    </View>
                  </View>

                  <TouchableOpacity 
                    style={styles.infoIcon}
                    onPress={() => openProfileSheet(currentProfile)}
                  >
                    <Info color="#fff" size={24} />
                  </TouchableOpacity>
                </LinearGradient>
              </Animated.View>
            </GestureDetector>
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyCircle}>
                <Heart color={themeColors.accent} size={48} />
              </View>
              <Text style={[styles.emptyText, { color: themeColors.text }]}>Revenez plus tard 💤</Text>
              <Text style={[styles.emptySub, { color: themeColors.textMuted }]}>
                Nous cherchons de nouveaux profils basés sur vos critères.
              </Text>
              <TouchableOpacity 
                style={[styles.resetFilterBtn, { backgroundColor: themeColors.accent }]}
                onPress={() => setFilterVisible(true)}
              >
                <Text style={styles.resetFilterText}>Affiner les filtres</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {currentProfile && (
          <View style={styles.buttonsContainer}>
            <TouchableOpacity 
              style={[styles.actionBtn, styles.dislikeBtn, { backgroundColor: themeColors.card }]} 
              onPress={() => handleAction('left')}
              activeOpacity={0.8}
            >
              <X color="#ef4444" size={32} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionBtn, styles.likeBtn, { backgroundColor: themeColors.card }]} 
              onPress={() => handleAction('right')}
              activeOpacity={0.8}
            >
              <Heart color="#10b981" size={32} fill="#10b981" />
            </TouchableOpacity>
          </View>
        )}

        <Modal visible={filterVisible} animationType="slide" transparent={true}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: themeColors.bgCard }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Filtres</Text>
                <TouchableOpacity onPress={() => setFilterVisible(false)}>
                  <X color={themeColors.text} size={24} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.filterSection}>
                  <Text style={[styles.filterLabel, { color: themeColors.textMuted }]}>Ville</Text>
                  <TouchableOpacity style={[styles.filterOption, { backgroundColor: themeColors.inputBg }]}>
                    <Text style={{ color: themeColors.text }}>{filters.city || 'Toutes les villes'}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.filterSection}>
                  <Text style={[styles.filterLabel, { color: themeColors.textMuted }]}>Groupe Sanguin</Text>
                  <View style={styles.filterGrid}>
                    {BLOOD_TYPES.map(type => (
                      <TouchableOpacity 
                        key={type}
                        onPress={() => setFilters({...filters, bloodType: filters.bloodType === type ? '' : type})}
                        style={[
                          styles.filterChip, 
                          { borderColor: themeColors.border },
                          filters.bloodType === type && { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
                        ]}
                      >
                        <Text style={{ color: filters.bloodType === type ? '#fff' : themeColors.text }}>{type}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.filterSection}>
                  <Text style={[styles.filterLabel, { color: themeColors.textMuted }]}>Statut Drépanocytaire</Text>
                  <View style={styles.filterGrid}>
                    {SICKLE_CELL_STATUS.map(status => (
                      <TouchableOpacity 
                        key={status.value}
                        onPress={() => setFilters({...filters, sickleCell: filters.sickleCell === status.value ? '' : status.value})}
                        style={[
                          styles.filterChip, 
                          { borderColor: themeColors.border, width: '47%' },
                          filters.sickleCell === status.value && { backgroundColor: '#3b82f6', borderColor: '#3b82f6' }
                        ]}
                      >
                        <Text style={{ color: filters.sickleCell === status.value ? '#fff' : themeColors.text }}>{status.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <TouchableOpacity 
                  style={[styles.applyBtn, { backgroundColor: themeColors.accent }]}
                  onPress={() => {
                    setFilterVisible(false);
                    fetchProfiles();
                  }}
                >
                  <Text style={styles.applyBtnText}>Appliquer</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {showMatch && (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={[StyleSheet.absoluteFill, styles.matchOverlay]}>
            <LinearGradient colors={['#f43f5e', '#ec4899']} style={StyleSheet.absoluteFill} />
            <SafeAreaView style={styles.matchContent}>
              <Animated.View entering={ZoomIn.delay(300)}>
                <Text style={styles.matchTitle}>C'est un Match ! 🎉</Text>
                <Text style={styles.matchSub}>Vous et {showMatch.partner.first_name} vous plaisez mutuellement.</Text>
              </Animated.View>

              <View style={styles.matchImages}>
                <Image source={{ uri: showMatch.partner.photos?.[0] }} style={[styles.matchImage, styles.matchImageLeft]} />
                <View style={styles.matchHeart}>
                  <Heart color="#fff" size={32} fill="#fff" />
                </View>
              </View>

              <TouchableOpacity style={styles.matchMessageBtn} onPress={() => setShowMatch(null)}>
                <Text style={styles.matchMessageText}>Envoyer un message</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.matchCloseBtn} onPress={() => setShowMatch(null)}>
                <Text style={styles.matchCloseText}>Continuer à swiper</Text>
              </TouchableOpacity>
            </SafeAreaView>
          </Animated.View>
        )}

      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 24, 
    paddingTop: 16, 
    paddingBottom: 8 
  },
  headerTitle: { fontSize: 28, fontWeight: 'bold' },
  headerSub: { fontSize: 14, opacity: 0.7 },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContainer: { flex: 1, padding: 16, justifyContent: 'center' },
  card: { 
    flex: 1, 
    borderRadius: 24, 
    overflow: 'hidden', 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 10 }, 
    shadowOpacity: 0.2, 
    shadowRadius: 20, 
    elevation: 10,
    backgroundColor: '#000'
  },
  nextCard: { position: 'absolute', top: 16, left: 16, right: 16, bottom: 16, zIndex: -1, opacity: 0.5 },
  image: { width: '100%', height: '100%', position: 'absolute' },
  paginationDots: { 
    position: 'absolute', 
    top: 15, 
    left: 20, 
    right: 20, 
    flexDirection: 'row', 
    gap: 5, 
    zIndex: 20 
  },
  dot: { flex: 1, height: 4, borderRadius: 2 },
  activeDot: { backgroundColor: '#fff' },
  inactiveDot: { backgroundColor: 'rgba(255,255,255,0.4)' },
  cardGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24, paddingTop: 100 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 },
  name: { color: '#ffffff', fontSize: 32, fontWeight: 'bold' },
  age: { color: '#ffffff', fontSize: 24, fontWeight: '400' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  city: { color: '#e5e7eb', fontSize: 16 },
  tagsRow: { flexDirection: 'row', gap: 10 },
  tag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  tagText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  infoIcon: { position: 'absolute', right: 24, bottom: 24, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  buttonsContainer: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingBottom: 24, 
    paddingTop: 8, 
    gap: 32 
  },
  actionBtn: { 
    width: 72, 
    height: 72, 
    borderRadius: 36, 
    justifyContent: 'center', 
    alignItems: 'center', 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 8 }, 
    shadowOpacity: 0.15, 
    shadowRadius: 12, 
    elevation: 8 
  },
  dislikeBtn: { borderColor: '#ef4444', borderWidth: 2 },
  likeBtn: { borderColor: '#10b981', borderWidth: 2 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyCircle: { 
    width: 140, 
    height: 140, 
    borderRadius: 70, 
    backgroundColor: 'rgba(244,63,94,0.1)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 32 
  },
  emptyText: { fontSize: 24, fontWeight: 'bold', marginBottom: 12 },
  emptySub: { fontSize: 16, textAlign: 'center', marginBottom: 32 },
  resetFilterBtn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 28 },
  resetFilterText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  stamp: { position: 'absolute', top: 120, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, borderWidth: 6, transform: [{ rotate: '-20deg' }], zIndex: 10 },
  stampLike: { left: 40, borderColor: '#10b981' },
  stampTextLike: { color: '#10b981', fontSize: 32, fontWeight: 'bold', letterSpacing: 3 },
  stampNope: { right: 40, borderColor: '#ef4444', transform: [{ rotate: '20deg' }] },
  stampTextNope: { color: '#ef4444', fontSize: 32, fontWeight: 'bold', letterSpacing: 3 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 32, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  modalTitle: { fontSize: 24, fontWeight: 'bold' },
  filterSection: { marginBottom: 24 },
  filterLabel: { fontSize: 14, fontWeight: '600', marginBottom: 12, textTransform: 'uppercase' },
  filterOption: { padding: 16, borderRadius: 12 },
  filterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, minWidth: 60, alignItems: 'center' },
  applyBtn: { paddingVertical: 18, borderRadius: 30, alignItems: 'center', marginTop: 16 },
  applyBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  matchOverlay: { zIndex: 100, justifyContent: 'center' },
  matchContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  matchTitle: { fontSize: 36, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 12 },
  matchSub: { fontSize: 18, color: '#fff', textAlign: 'center', opacity: 0.9, marginBottom: 48 },
  matchImages: { flexDirection: 'row', alignItems: 'center', marginBottom: 64 },
  matchImage: { width: 150, height: 200, borderRadius: 20, borderWidth: 4, borderColor: '#fff' },
  matchImageLeft: { transform: [{ rotate: '-10deg' }] },
  matchHeart: { 
    position: 'absolute', 
    top: '35%', 
    left: '35%', 
    width: 64, 
    height: 64, 
    borderRadius: 32, 
    backgroundColor: '#f43f5e', 
    justifyContent: 'center', 
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff'
  },
  matchMessageBtn: { 
    backgroundColor: '#fff', 
    width: '100%', 
    paddingVertical: 18, 
    borderRadius: 30, 
    alignItems: 'center', 
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10
  },
  matchMessageText: { color: '#f43f5e', fontSize: 18, fontWeight: 'bold' },
  matchCloseBtn: { paddingVertical: 12 },
  matchCloseText: { color: '#fff', fontSize: 16, fontWeight: '600', opacity: 0.8 }
});
