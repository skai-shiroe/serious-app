import { supabase } from '@/lib/supabase';
import { getUser } from '@/lib/session';
import {
  fetchCandidateProfiles,
  isAgeInRange,
  matchesTargetGender,
} from '@/lib/candidates';
import { CITIES, normalizeText } from '@/lib/cities';
import { EmptyState } from '@/components/empty-state';
import {
  CertifiedPhotoBadge,
  GenotypeVerifiedBadge,
  IdentityVerifiedIcon,
  isFullyVerified,
} from '@/components/verified-badge';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Filter, Heart, MapPin, X, Info, ChevronDown, ChevronLeft, ChevronRight, WifiOff } from 'lucide-react-native';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ActivityIndicator, Dimensions, Modal, StyleSheet, Text, TextInput, TouchableOpacity, useColorScheme, View, ScrollView } from 'react-native';
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

/** Filtres au repos (compteur « filtres actifs » + bouton reinitialiser). */
const DEFAULT_FILTERS = {
  ageMin: 18,
  ageMax: 70,
  city: '',
  bloodType: '',
  sickleCell: '',
};

/** Tranches proposees pour l'age (pas de slider : puces comme les autres filtres). */
const AGE_MIN_CHOICES = [18, 21, 25, 30, 35, 40, 45, 50, 55, 60];
const AGE_MAX_CHOICES = [25, 30, 35, 40, 45, 50, 55, 60, 65, 70];

export default function MatchScreen() {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [showMatch, setShowMatch] = useState<any>(null);
  const [filterVisible, setFilterVisible] = useState(false);
  // Distingue « aucun profil » (liste reellement vide) de « chargement echoue »
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  // Brouillon edite dans la modale : rien ne part en requete avant « Appliquer »
  // (avant, chaque pucelle rechargait le deck pendant la saisie).
  const [draftFilters, setDraftFilters] = useState({ ...DEFAULT_FILTERS });
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');

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

  // Refs synchronisees : evite les closures obsoletes lors de swipes rapides
  // et sert a la pagination du deck.
  const profilesRef = useRef<any[]>([]);
  const currentIndexRef = useRef(0);
  const loadingMoreRef = useRef(false);
  // Curseur de pagination du deck : `user_id` du dernier profil parcouru.
  const deckCursorRef = useRef<string | null>(null);
  // Genre du visiteur, lu une seule fois puis mis en cache : il conditionne le
  // filtrage strict du deck (voir lib/candidates.ts).
  const viewerGenderRef = useRef<string | null | undefined>(undefined);
  const loadViewerGender = useCallback(async (): Promise<string | null> => {
    if (viewerGenderRef.current !== undefined) return viewerGenderRef.current;
    try {
      const user = await getUser();
      if (!user) {
        viewerGenderRef.current = null;
      } else {
        const { data } = await supabase
          .from('profiles')
          .select('gender')
          .eq('user_id', user.id)
          .maybeSingle();
        viewerGenderRef.current = data?.gender ?? null;
      }
    } catch {
      viewerGenderRef.current = null;
    }
    // `?? null` : la ref est declaree `| undefined` (jamais indeterminee ici,
    // mais TypeScript ne le prouve pas).
    return viewerGenderRef.current ?? null;
  }, []);

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

  /** Ouvre la modale en repartant des filtres deja appliques. */
  const openFilters = () => {
    setDraftFilters({ ...filters });
    setCitySearch('');
    setCityPickerOpen(false);
    setFilterVisible(true);
  };

  /**
   * Borne d'age : la minimum ne peut pas depasser la maximum. Si le choix
   * traverse l'autre borne, on translate la fenetre (largeur conservee) plutot
   * que de laisser un etat incoherent.
   */
  const setDraftAge = (key: 'ageMin' | 'ageMax', value: number) => {
    setDraftFilters((prev) => {
      const ageMin = key === 'ageMin' ? value : prev.ageMin;
      const ageMax = key === 'ageMax' ? value : prev.ageMax;
      return ageMin > ageMax
        ? { ...prev, ageMin: Math.min(ageMin, ageMax), ageMax: Math.max(ageMin, ageMax) }
        : { ...prev, ageMin, ageMax };
    });
  };

  const selectCity = (city: string) => {
    setDraftFilters((prev) => ({ ...prev, city }));
    setCityPickerOpen(false);
    setCitySearch('');
  };

  /** Nombre de filtres qui s'ecartent des valeurs par defaut. */
  const activeFilterCount =
    (filters.city ? 1 : 0) +
    (filters.bloodType ? 1 : 0) +
    (filters.sickleCell ? 1 : 0) +
    (filters.ageMin !== DEFAULT_FILTERS.ageMin || filters.ageMax !== DEFAULT_FILTERS.ageMax
      ? 1
      : 0);

  // Villes proposees dans le selecteur, filtrees par la recherche (sans egard
  // aux accents : « fes » trouve « Fès »).
  const cityQuery = normalizeText(citySearch.trim());
  const visibleCities = cityQuery
    ? CITIES.filter((city) => normalizeText(city).includes(cityQuery))
    : CITIES;

  const fetchProfiles = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const user = await getUser();
      if (!user) return;
      const viewerGender = await loadViewerGender();

      // Le deck repart du debut : le curseur est remis a zero.
      deckCursorRef.current = null;

      const page = await fetchCandidateProfiles({
        userId: user.id,
        limit: 30,
        after: null,
        filters,
        viewerGender,
      });

      deckCursorRef.current = page.cursor;

      // Filet de securite : les bornes d'age sont deja filtrees par la RPC
      // (ou par la boucle du repli client).
      const filtered = page.profiles.filter(
        (p) =>
          isAgeInRange(p.birth_date, filters.ageMin, filters.ageMax) &&
          matchesTargetGender(p.gender, viewerGender)
      );

      setProfiles(filtered);
      setCurrentIndex(0);
      setCurrentPhotoIndex(0);
    } catch (error) {
      console.log('Error fetching potential matches', error);
      setLoadError(
        'Impossible de charger les profils. Vérifiez votre connexion puis réessayez.'
      );
    } finally {
      setLoading(false);
    }
  }, [filters, loadViewerGender]);

  // Precharge les photos dans le cache MEMOIRE : la carte est deja decodee
  // quand elle passe au premier plan (supprime l'effet "carte grise").
  const prefetchPhotos = useCallback((list: any[], from: number, count: number, perProfile: number) => {
    const urls: string[] = [];
    for (let i = from; i < Math.min(from + count, list.length); i++) {
      const pics: string[] = list[i]?.photos || [];
      pics.slice(0, perProfile).forEach((uri) => {
        if (typeof uri === 'string' && uri.startsWith('http')) urls.push(uri);
      });
    }
    if (urls.length > 0) {
      void Image.prefetch(urls, 'memory-disk').catch(() => undefined);
    }
  }, []);

  // Deck quasi infini : la page suivante est demandee par CURSEUR
  // (`user_id` croissant), sans jamais mettre de liste d'identifiants dans
  // l'URL de la requete (cf. lib/candidates.ts).
  const fetchMoreProfiles = useCallback(async () => {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    try {
      const user = await getUser();
      if (!user) return;
      const viewerGender = await loadViewerGender();

      const page = await fetchCandidateProfiles({
        userId: user.id,
        limit: 10,
        after: deckCursorRef.current,
        filters,
        viewerGender,
      });

      if (page.cursor) deckCursorRef.current = page.cursor;

      const more = page.profiles.filter(
        (p) =>
          isAgeInRange(p.birth_date, filters.ageMin, filters.ageMax) &&
          matchesTargetGender(p.gender, viewerGender)
      );

      if (more.length > 0) {
        setProfiles((prev) => [...prev, ...more]);
      }
    } catch (error) {
      console.log('Error fetching more profiles', error);
    } finally {
      loadingMoreRef.current = false;
    }
  }, [filters, loadViewerGender]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // Reference a jour de l'etat, pour les callbacks de gestes
  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  // Prechargement : photo principale des 3 profils suivants + toutes les photos
  // de la carte active (pour les taps gauche/droite).
  useEffect(() => {
    currentIndexRef.current = currentIndex;
    prefetchPhotos(profiles, currentIndex + 1, 3, 1);
    prefetchPhotos(profiles, currentIndex, 1, 6);
  }, [currentIndex, profiles, prefetchPhotos]);

  useEffect(() => {
    if (profiles.length > 0 && currentIndex >= profiles.length - 3) {
      fetchMoreProfiles();
    }
  }, [currentIndex, profiles.length, fetchMoreProfiles]);

  const handlePhotoTap = (delta: number) => {
    const profile = profilesRef.current[currentIndexRef.current];
    const total = profile?.photos?.length ?? 0;
    if (total <= 1) return;
    setCurrentPhotoIndex((prev) => Math.min(Math.max(prev + delta, 0), total - 1));
  };

  const handleOpenProfileSheet = () => {
    const profile = profilesRef.current[currentIndexRef.current];
    if (profile) openProfileSheet(profile);
  };

  const onSwipeComplete = (direction: 'left' | 'right') => {
    const swipedProfile = profilesRef.current[currentIndexRef.current];
    if (!swipedProfile) return;

    // Retour haptique immediat (avant les allers-retours reseau)
    Haptics.impactAsync(
      direction === 'right' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium
    );

    setCurrentIndex((prev) => prev + 1);
    setCurrentPhotoIndex(0);
    translateX.value = 0;
    translateY.value = 0;

    (async () => {
      try {
        const currentUser = await getUser();
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
          }
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
        translateX.value = withTiming(SCREEN_WIDTH * 1.5, { duration: 200 }, () => {
          runOnJS(onSwipeComplete)('right');
        });
      } else if (translateX.value < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-SCREEN_WIDTH * 1.5, { duration: 200 }, () => {
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

      if (x < cardWidth * 0.3) {
        // Tap gauche -> photo précédente
        runOnJS(handlePhotoTap)(-1);
      } else if (x > cardWidth * 0.7) {
        // Tap droite -> photo suivante
        runOnJS(handlePhotoTap)(1);
      } else {
        // Tap centre -> détails
        runOnJS(handleOpenProfileSheet)();
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

  // La carte du dessous "grandit" avec la progression du swipe : elle est deja
  // a l'echelle 1 / pleinement opaque quand elle devient la carte active.
  const nextCardStyle = useAnimatedStyle(() => {
    const progress = Math.min(Math.abs(translateX.value) / SWIPE_THRESHOLD, 1);
    return {
      transform: [{ scale: 0.96 + 0.04 * progress }],
      opacity: 0.85 + 0.15 * progress,
    };
  });

  const handleAction = (direction: 'left' | 'right') => {
    const target = direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
    translateX.value = withTiming(target, { duration: 200 }, () => {
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
  const currentPhoto = currentProfile?.photos?.[currentPhotoIndex];
  const nextPhoto = nextProfile?.photos?.[0];

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.bg }]}>
        
        <View style={styles.header}>
          <View>
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>Découvrir</Text>
            <Text style={[styles.headerSub, { color: themeColors.textMuted }]}>Trouvez votre compatibilité</Text>
          </View>
          <TouchableOpacity
            style={[
              styles.filterBtn,
              { backgroundColor: themeColors.card, borderColor: themeColors.border, position: 'relative' },
            ]}
            onPress={openFilters}
          >
            <Filter color={activeFilterCount > 0 ? themeColors.accent : themeColors.text} size={20} />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.cardContainer}>
          {nextProfile && (
            <Animated.View style={[styles.card, styles.nextCard, { backgroundColor: themeColors.card }, nextCardStyle]}>
              <Image
                source={nextPhoto ? { uri: nextPhoto } : undefined}
                style={styles.image}
                contentFit="cover"
                cachePolicy="memory-disk"
                priority="low"
                recyclingKey={`next-${nextProfile.user_id}`}
              />
            </Animated.View>
          )}

          {currentProfile ? (
            <GestureDetector gesture={Gesture.Exclusive(panGesture, tapGesture)}>
              <Animated.View style={[styles.card, styles.activeCard, { backgroundColor: themeColors.card }, cardStyle]}>
                <Image
                  source={currentPhoto ? { uri: currentPhoto } : undefined}
                  style={styles.image}
                  contentFit="cover"
                  transition={150}
                  cachePolicy="memory-disk"
                  priority="high"
                />

                {isFullyVerified(currentProfile) && (
                  <CertifiedPhotoBadge size={30} style={{ top: 16, right: 16 }} />
                )}
                
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
                    {!isFullyVerified(currentProfile) && currentProfile.identity_verified && (
                      <IdentityVerifiedIcon size={22} color="#22d3ee" />
                    )}
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
                    {!isFullyVerified(currentProfile) && currentProfile.genotype_verified && (
                      <GenotypeVerifiedBadge
                        genotype={currentProfile.sickle_cell}
                        variant="onPhoto"
                      />
                    )}
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
          ) : loadError ? (
            <EmptyState
              isError
              icon={<WifiOff color={themeColors.textMuted} size={48} />}
              title="Chargement impossible"
              message={loadError}
              actionLabel="Réessayer"
              onAction={() => fetchProfiles()}
            />
          ) : (
            <EmptyState
              icon={<Heart color={themeColors.accent} size={48} />}
              title="Revenez plus tard 💤"
              message="Nous cherchons de nouveaux profils basés sur vos critères."
              actionLabel="Affiner les filtres"
              onAction={openFilters}
            />
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
                  <TouchableOpacity
                    style={[
                      styles.filterOption,
                      {
                        backgroundColor: themeColors.inputBg,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      },
                    ]}
                    onPress={() => setCityPickerOpen((open) => !open)}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: themeColors.text }}>
                      {draftFilters.city || 'Toutes les villes'}
                    </Text>
                    <ChevronDown
                      color={themeColors.textMuted}
                      size={18}
                      style={{ transform: [{ rotate: cityPickerOpen ? '180deg' : '0deg' }] }}
                    />
                  </TouchableOpacity>

                  {cityPickerOpen && (
                    <View style={{ marginTop: 10 }}>
                      <TextInput
                        style={[
                          styles.citySearch,
                          {
                            backgroundColor: themeColors.inputBg,
                            borderColor: themeColors.border,
                            color: themeColors.text,
                          },
                        ]}
                        placeholder="Rechercher une ville"
                        placeholderTextColor={themeColors.textMuted}
                        value={citySearch}
                        onChangeText={setCitySearch}
                        autoCorrect={false}
                        autoCapitalize="words"
                      />
                      <ScrollView style={styles.cityList} keyboardShouldPersistTaps="handled">
                        <TouchableOpacity
                          onPress={() => selectCity('')}
                          style={[
                            styles.cityOption,
                            { backgroundColor: themeColors.inputBg },
                            !draftFilters.city && { backgroundColor: themeColors.accent },
                          ]}
                        >
                          <Text style={{ color: !draftFilters.city ? '#fff' : themeColors.text }}>
                            Toutes les villes
                          </Text>
                        </TouchableOpacity>
                        {visibleCities.map((city) => {
                          const selected = draftFilters.city === city;
                          return (
                            <TouchableOpacity
                              key={city}
                              onPress={() => selectCity(city)}
                              style={[
                                styles.cityOption,
                                { backgroundColor: themeColors.inputBg },
                                selected && { backgroundColor: themeColors.accent },
                              ]}
                            >
                              <Text style={{ color: selected ? '#fff' : themeColors.text }}>
                                {city}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                        {visibleCities.length === 0 && (
                          <Text style={{ color: themeColors.textMuted, paddingVertical: 10 }}>
                            Aucune ville trouvée
                          </Text>
                        )}
                      </ScrollView>
                    </View>
                  )}
                </View>

                <View style={styles.filterSection}>
                  <Text style={[styles.filterLabel, { color: themeColors.textMuted }]}>Âge</Text>
                  <Text style={[styles.ageSubLabel, { color: themeColors.textMuted }]}>
                    Âge minimum
                  </Text>
                  <View style={styles.filterGrid}>
                    {AGE_MIN_CHOICES.map((age) => (
                      <TouchableOpacity
                        key={`min-${age}`}
                        onPress={() => setDraftAge('ageMin', age)}
                        style={[
                          styles.filterChip,
                          { borderColor: themeColors.border },
                          draftFilters.ageMin === age && {
                            backgroundColor: themeColors.accent,
                            borderColor: themeColors.accent,
                          },
                        ]}
                      >
                        <Text style={{ color: draftFilters.ageMin === age ? '#fff' : themeColors.text }}>
                          {age} ans
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text
                    style={[
                      styles.ageSubLabel,
                      { color: themeColors.textMuted, marginTop: 16 },
                    ]}
                  >
                    Âge maximum
                  </Text>
                  <View style={styles.filterGrid}>
                    {AGE_MAX_CHOICES.map((age) => (
                      <TouchableOpacity
                        key={`max-${age}`}
                        onPress={() => setDraftAge('ageMax', age)}
                        style={[
                          styles.filterChip,
                          { borderColor: themeColors.border },
                          draftFilters.ageMax === age && {
                            backgroundColor: themeColors.accent,
                            borderColor: themeColors.accent,
                          },
                        ]}
                      >
                        <Text style={{ color: draftFilters.ageMax === age ? '#fff' : themeColors.text }}>
                          {age} ans
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.filterSection}>
                  <Text style={[styles.filterLabel, { color: themeColors.textMuted }]}>Groupe Sanguin</Text>
                  <View style={styles.filterGrid}>
                    {BLOOD_TYPES.map(type => (
                      <TouchableOpacity 
                        key={type}
                        onPress={() => setDraftFilters({ ...draftFilters, bloodType: draftFilters.bloodType === type ? '' : type })}
                        style={[
                          styles.filterChip, 
                          { borderColor: themeColors.border },
                          draftFilters.bloodType === type && { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
                        ]}
                      >
                        <Text style={{ color: draftFilters.bloodType === type ? '#fff' : themeColors.text }}>{type}</Text>
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
                        onPress={() => setDraftFilters({ ...draftFilters, sickleCell: draftFilters.sickleCell === status.value ? '' : status.value })}
                        style={[
                          styles.filterChip, 
                          { borderColor: themeColors.border, width: '47%' },
                          draftFilters.sickleCell === status.value && { backgroundColor: '#3b82f6', borderColor: '#3b82f6' }
                        ]}
                      >
                        <Text style={{ color: draftFilters.sickleCell === status.value ? '#fff' : themeColors.text }}>{status.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.applyBtn, { backgroundColor: themeColors.accent }]}
                  onPress={() => {
                    setFilterVisible(false);
                    // Nouvelle identite d'objet => le deck se recharge tout seul
                    // (useEffect sur fetchProfiles).
                    setFilters({ ...draftFilters });
                  }}
                >
                  <Text style={styles.applyBtnText}>Appliquer</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.resetBtn, { borderColor: themeColors.border }]}
                  onPress={() => {
                    setDraftFilters({ ...DEFAULT_FILTERS });
                    setCitySearch('');
                    setCityPickerOpen(false);
                  }}
                >
                  <Text style={[styles.resetBtnText, { color: themeColors.textMuted }]}>
                    Réinitialiser les filtres
                  </Text>
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
                <Text style={styles.matchTitle}>C&apos;est un Match ! 🎉</Text>
                <Text style={styles.matchSub}>Vous et {showMatch.partner.first_name} vous plaisez mutuellement.</Text>
              </Animated.View>

              <View style={styles.matchImages}>
                <Image source={{ uri: showMatch.partner.photos?.[0] }} style={[styles.matchImage, styles.matchImageLeft]} cachePolicy="memory-disk" />
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
  nextCard: { position: 'absolute', top: 16, left: 16, right: 16, bottom: 16, zIndex: 0 },
  activeCard: { zIndex: 1 },
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
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
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
  ageSubLabel: { fontSize: 13, fontWeight: '600', marginBottom: 10 },
  citySearch: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    marginBottom: 8,
  },
  cityList: { maxHeight: 230 },
  cityOption: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, marginBottom: 6 },
  resetBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  resetBtnText: { fontSize: 15, fontWeight: '600' },
  filterBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#f43f5e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
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
