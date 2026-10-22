import { supabase } from '@/lib/supabase';
import { getUser } from '@/lib/session';
import {
  fetchCandidateProfiles,
  isAgeInRange,
  matchesTargetGender,
} from '@/lib/candidates';
import CityPickerModal from '@/components/city-picker-modal';
import RangeSlider from '@/components/range-slider';
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
import { Filter, Heart, MapPin, X, Info, ChevronLeft, ChevronRight, WifiOff, Undo2 } from 'lucide-react-native';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ActivityIndicator, Alert, Dimensions, Modal, StyleSheet, Text, TouchableOpacity, useColorScheme, useWindowDimensions, View, ScrollView } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS, interpolate, Extrapolation, withTiming, FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useProfileSheet } from '@/contexts/ProfileSheetContext';
import { useFocusEffect, useRouter } from 'expo-router';
import { watchAppSetting } from '@/lib/app-settings';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;
/**
 * Seuil vertical : glisser la carte vers le HAUT ouvre la fiche detail (i)
 * au lieu de declencher like/dislike (composeur horizontal).
 */
const VERTICAL_SWIPE_THRESHOLD = SCREEN_HEIGHT * 0.15;
/** Fenêtre de l'annulation de swipe : 1 seul niveau, 10 s après le geste. */
const UNDO_WINDOW_MS = 10_000;

/** Filtres au repos (compteur « filtres actifs » + bouton reinitialiser). */
const DEFAULT_FILTERS = {
  ageMin: 18,
  ageMax: 70,
  city: '',
};

/** Bornes d'age du filtre (slider d'intervalle, cf. RangeSlider). */
const AGE_FILTER_MIN = 18;
const AGE_FILTER_MAX = 80;

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
  const [filterDefaults, setFilterDefaults] = useState({ ...DEFAULT_FILTERS });
  const [compatibilityInfoVisible, setCompatibilityInfoVisible] = useState(false);
  const [viewerGenotype, setViewerGenotype] = useState<string | null>(null);
  const [pendingReceivedLikes, setPendingReceivedLikes] = useState(0);
  const [ageBounds, setAgeBounds] = useState({ min: AGE_FILTER_MIN, max: AGE_FILTER_MAX });
  const [cityModalVisible, setCityModalVisible] = useState(false);
  // Dernier swipe effectué : annulation possible pendant UNDO_WINDOW_MS
  // (1 seul niveau — remplacé à chaque nouveau swipe, cf. sql/undo-swipe.sql).
  const [lastSwipe, setLastSwipe] = useState<{
    swipedId: string;
    direction: 'left' | 'right';
    matchId?: string;
    at: number;
  } | null>(null);

  const { openProfileSheet } = useProfileSheet();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  // L’iPhone SE (667 pt de haut) et les appareils compacts manquent surtout
  // d’espace vertical : réduire les marges garde la carte et ses actions visibles.
  const isCompactScreen = windowHeight <= 700 || windowWidth <= 360;

  const refreshReceivedLikesCount = useCallback(async () => {
    try {
      const user = await getUser();
      if (!user) {
        setPendingReceivedLikes(0);
        return;
      }
      const { data, error } = await supabase.rpc('get_received_likes_count');
      if (error) throw error;
      setPendingReceivedLikes(Math.max(0, Number(data) || 0));
    } catch {
      // Une indisponibilité réseau conserve le dernier nombre connu.
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void refreshReceivedLikesCount();
  }, [refreshReceivedLikesCount]));

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribeToSwipeChanges = async () => {
      const user = await getUser();
      if (!active || !user) return;

      channel = supabase
        .channel(`received-likes-count:${user.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'swipes',
        }, (payload) => {
          const row = (payload.new && Object.keys(payload.new).length
            ? payload.new
            : payload.old) as { swiper_id?: string; swiped_id?: string };
          // RLS limite les événements visibles aux swipes envoyés ou reçus
          // par ce compte. On recalcule le total serveur après chaque changement.
          if (row.swiper_id === user.id || row.swiped_id === user.id) {
            void refreshReceivedLikesCount();
          }
        })
        .subscribe();
    };

    void subscribeToSwipeChanges();
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [refreshReceivedLikesCount]);

  useEffect(() => {
    const config = { options: null as any, appDefaults: {} as any };
    const applyConfig = () => {
      const { options, appDefaults } = config;
      if (!options) return;
      const min = Math.min(98, Math.max(18, Number(appDefaults.default_age_min ?? options.matching?.age_min) || 18));
      const max = Math.max(min + 1, Math.min(99, Number(appDefaults.default_age_max ?? options.matching?.age_max) || 80));
      const defaults = { ...DEFAULT_FILTERS, ageMin: min, ageMax: max };
      setAgeBounds({ min, max });
      setFilterDefaults(defaults);
      setFilters(defaults);
      setDraftFilters(defaults);
    };
    const stopOptions = watchAppSetting<any>('profile_options', null, (value) => { config.options = value; applyConfig(); });
    const stopDefaults = watchAppSetting<any>('app_defaults', {}, (value) => { config.appDefaults = value ?? {}; applyConfig(); });
    return () => { stopOptions(); stopDefaults(); };
  }, []);

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
  // Pays du visiteur : borne la liste de villes proposee par le filtre deck.
  const [viewerCountry, setViewerCountry] = useState<string | null>(null);
  const loadViewerGender = useCallback(async (): Promise<string | null> => {
    if (viewerGenderRef.current !== undefined) return viewerGenderRef.current;
    try {
      const user = await getUser();
      if (!user) {
        viewerGenderRef.current = null;
      } else {
        const { data } = await supabase.rpc('get_my_profile').single();
        viewerGenderRef.current = data?.gender ?? null;
        setViewerCountry(data?.country_code ?? null);
        setViewerGenotype(data?.sickle_cell ?? null);
      }
    } catch {
      // Echec NON memorise : on retente a la prochaine lecture. Si on mettait
      // `null` dans la ref ici, le filtre de genre resterait desactive pour
      // toute la session apres un simple hoquet reseau.
      return null;
    }
    // `?? null` : la ref est declaree `| undefined` (jamais indeterminee ici,
    // mais TypeScript ne le prouve pas).
    return viewerGenderRef.current ?? null;
  }, []);

  /** Ouvre la modale en repartant des filtres deja appliques. */
  const openFilters = () => {
    setDraftFilters({ ...filters });
    setFilterVisible(true);
  };

  /**
   * Borne d'age : le slider d'intervalle garantit deja low <= high (ecart
   * minimum = un an), on ne fait que reporter le draft.
   */
  const setDraftAgeRange = (ageMin: number, ageMax: number) => {
    setDraftFilters((prev) => ({ ...prev, ageMin, ageMax }));
  };

  const selectCity = (city: string) => {
    setDraftFilters((prev) => ({ ...prev, city }));
  };

  /** Nombre de filtres qui s'ecartent des valeurs par defaut. */
  const activeFilterCount =
    (filters.city ? 1 : 0) +
    (filters.ageMin !== filterDefaults.ageMin || filters.ageMax !== filterDefaults.ageMax
      ? 1
      : 0);

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

      // La RPC applique les filtres d'âge avant de renvoyer l'âge public.
      const filtered = page.profiles.filter(
        (p) =>
          isAgeInRange(p.age, filters.ageMin, filters.ageMax) &&
          matchesTargetGender(p.gender, viewerGender)
      );

      setProfiles(filtered);
      setCurrentIndex(0);
      setCurrentPhotoIndex(0);
    } catch {
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
          isAgeInRange(p.age, filters.ageMin, filters.ageMax) &&
          matchesTargetGender(p.gender, viewerGender)
      );

      if (more.length > 0) {
        setProfiles((prev) => [...prev, ...more]);
      }
    } catch {
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

        const { error: swipeError } = await supabase.from('swipes').insert({
          swiper_id: currentUser.id,
          swiped_id: swipedProfile.user_id,
          direction: swipeDir
        });

        // Undo : mémorise le swipe (1 niveau, 10 s). Pas de bouton si
        // l'insert a échoué — il n'y aurait rien d'annulable.
        if (!swipeError) {
          setLastSwipe({ swipedId: swipedProfile.user_id, direction, at: Date.now() });
        }

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
              partner: swipedProfile,
              // Id du match (recupere juste au-dessus) : indispensable pour
              // ouvrir directement la conversation depuis la modale.
              matchId: matchData.id
            });
            // Le swipe venait de créer un match : à supprimer aussi en cas
            // d'annulation (best effort, cf. handleUndoSwipe).
            setLastSwipe((prev) => (prev ? { ...prev, matchId: matchData.id } : prev));
          }
        }
      } catch {}
    })();
  };

  // Le bouton « Annuler » se masque tout seul après la fenêtre des 10 s.
  useEffect(() => {
    if (!lastSwipe) return;
    const timer = setTimeout(() => setLastSwipe(null), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [lastSwipe]);

  /**
   * Annulation du dernier swipe : supprime la ligne `swipes` (RLS DELETE own,
   * sql/undo-swipe.sql) et, s'il avait créé un match, le match ; puis revient
   * d'une carte en arrière.
   *
   * Le delete est contrôlé via `.select()` : PostgREST ne renvoie PAS d'erreur
   * quand 0 ligne est supprimée (cas d'une base sans le bloc 13) — dans ce cas
   * on n'avance pas le deck et on prévient, sinon le swipe reviendrait au
   * prochain démarrage sans que l'utilisateur le sache.
   */
  const handleUndoSwipe = () => {
    const target = lastSwipe;
    if (!target || currentIndexRef.current <= 0) {
      setLastSwipe(null);
      return;
    }

    (async () => {
      try {
        const me = await getUser();
        if (!me) throw new Error('Session absente');

        const { data: deleted, error } = await supabase
          .from('swipes')
          .delete()
          .eq('swiper_id', me.id)
          .eq('swiped_id', target.swipedId)
          .eq('direction', target.direction === 'right' ? 'like' : 'dislike')
          .select('swiped_id');
        if (error) throw error;
        if (!deleted || deleted.length === 0) {
          throw new Error('RLS sans effet (sql/undo-swipe.sql non exécuté ?)');
        }

        if (target.matchId) {
          // Best effort : le match disparait aussi, sinon il subsisterait
          // orphelin d'un swipe qui n'existe plus.
          await supabase.from('matches').delete().eq('id', target.matchId);
        }

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setCurrentIndex((prev) => Math.max(prev - 1, 0));
        setCurrentPhotoIndex(0);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        setLastSwipe(null);
      } catch (err: any) {
        setLastSwipe(null);
        Alert.alert(
          'Annulation impossible',
          String(err?.message || 'Vérifiez votre connexion puis réessayez.')
        );
      }
    })();
  };

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      // Swipe vers le HAUT (zone ou peu de derivation horizontale) : ouvre la
      // fiche complete du profil, comme le bouton (i). Pas de like/dislike.
      if (
        Math.abs(translateX.value) < SWIPE_THRESHOLD &&
        translateY.value < -VERTICAL_SWIPE_THRESHOLD
      ) {
        translateY.value = withTiming(-SCREEN_HEIGHT * 0.3, { duration: 180 }, (finished) => {
          if (finished) {
            runOnJS(handleOpenProfileSheet)();
            translateY.value = withSpring(0);
          }
        });
        return;
      }
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
        
        <View style={[styles.header, isCompactScreen && styles.headerCompact]}>
          <View style={styles.headerCopy}>
            <Text style={[styles.headerTitle, isCompactScreen && styles.headerTitleCompact, { color: themeColors.text }]}>Découvrir</Text>
            <Text style={[styles.headerSub, isCompactScreen && styles.headerSubCompact, { color: themeColors.textMuted }]}>Trouvez votre compatibilité</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.likesShortcut, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
              onPress={() => router.push('/received-likes')}
              accessibilityRole="button"
              accessibilityLabel={`Voir les likes reçus${pendingReceivedLikes > 0 ? `, ${pendingReceivedLikes} en attente` : ''}`}
            >
              <Heart color={themeColors.accent} size={18} />
              <Text style={[styles.likesShortcutText, { color: themeColors.accent }]}>Likes</Text>
              {pendingReceivedLikes > 0 && (
                <View style={styles.likesCountBadge}>
                  <Text style={styles.likesCountBadgeText}>
                    {pendingReceivedLikes > 99 ? '99+' : pendingReceivedLikes}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterBtn,
                { backgroundColor: themeColors.card, borderColor: themeColors.border, position: 'relative' },
              ]}
              onPress={openFilters}
              accessibilityRole="button"
              accessibilityLabel="Ouvrir les filtres"
            >
              <Filter color={activeFilterCount > 0 ? themeColors.accent : themeColors.text} size={20} />
              {activeFilterCount > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.cardContainer, isCompactScreen && styles.cardContainerCompact]}>
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

                {/* Badge de certification : pose SOUS la barre des points de
                    pagination (top 15 + 4 px de haut, zIndex 20 par-dessus). */}
                {isFullyVerified(currentProfile) && (
                  <CertifiedPhotoBadge size={30} style={{ top: 28, right: 16 }} />
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
                  style={[styles.cardGradient, isCompactScreen && styles.cardGradientCompact]}
                >
                  <View style={styles.infoRow}>
                    <Text style={[styles.name, isCompactScreen && styles.nameCompact]} numberOfLines={1}>{currentProfile.first_name}</Text>
                    {!isFullyVerified(currentProfile) && currentProfile.identity_verified && (
                      <IdentityVerifiedIcon size={22} />
                    )}
                    <Text style={[styles.age, isCompactScreen && styles.ageCompact]}>{currentProfile.age ?? '—'}</Text>
                  </View>
                  <View style={[styles.locationRow, isCompactScreen && styles.locationRowCompact]}>
                    <MapPin color="#e5e7eb" size={16} />
                    <Text style={[styles.city, isCompactScreen && styles.cityCompact]} numberOfLines={1}>{currentProfile.city}</Text>
                  </View>

                  {/* Centres d interet (5 premiers + « +n ») : deja presents
                      dans le profil charge, zero requete supplementaire. */}
                  {Array.isArray(currentProfile.interests) &&
                    currentProfile.interests.length > 0 && (
                      <View style={[styles.interestsRow, isCompactScreen && styles.interestsRowCompact]}>
                        {currentProfile.interests.slice(0, isCompactScreen ? 3 : 5).map((interest: string) => (
                          <View key={interest} style={styles.interestChip}>
                            <Text style={styles.interestChipText}>{interest}</Text>
                          </View>
                        ))}
                        {currentProfile.interests.length > (isCompactScreen ? 3 : 5) && (
                          <View style={styles.interestChip}>
                            <Text style={styles.interestChipText}>
                              +{currentProfile.interests.length - (isCompactScreen ? 3 : 5)}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}

                  {(currentProfile.blood_type || currentProfile.sickle_cell) && (
                    <View style={styles.tagsRow}>
                      {!!currentProfile.blood_type && (
                        <View style={[styles.tag, isCompactScreen && styles.tagCompact, { backgroundColor: 'rgba(244,63,94,0.3)' }]}>
                          <Text style={styles.tagText}>{currentProfile.blood_type}</Text>
                        </View>
                      )}
                      {!!currentProfile.sickle_cell && (
                        <View style={[styles.tag, isCompactScreen && styles.tagCompact, { backgroundColor: 'rgba(59,130,246,0.3)' }]}>
                          <Text style={styles.tagText}>{currentProfile.sickle_cell}</Text>
                        </View>
                      )}
                      {!isFullyVerified(currentProfile) && currentProfile.genotype_verified && (
                        <GenotypeVerifiedBadge genotype={currentProfile.sickle_cell} variant="onPhoto" />
                      )}
                    </View>
                  )}

                  <TouchableOpacity 
                    style={[styles.infoIcon, isCompactScreen && styles.infoIconCompact]}
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
              message="Aucun profil ne correspond pour le moment à tes critères et à la règle de compatibilité Géno. Tu peux ajuster tes filtres ou consulter la règle en haut de l’écran."
              actionLabel="Affiner les filtres"
              onAction={openFilters}
            />
          )}
        </View>

        {/* Annulation du dernier swipe : 1 seul niveau, fenêtre de 10 s */}
        {lastSwipe && currentIndex > 0 && (
          <View style={styles.undoRow}>
            <TouchableOpacity
              style={[styles.undoBtn, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
              onPress={handleUndoSwipe}
              activeOpacity={0.8}
            >
              <Undo2 color={themeColors.accent} size={18} />
              <Text style={[styles.undoText, { color: themeColors.text }]}>Annuler</Text>
            </TouchableOpacity>
          </View>
        )}

        {currentProfile && (
          <View style={[styles.buttonsContainer, isCompactScreen && styles.buttonsContainerCompact]}>
            <TouchableOpacity 
              style={[styles.actionBtn, isCompactScreen && styles.actionBtnCompact, styles.dislikeBtn, { backgroundColor: themeColors.card }]}
              onPress={() => handleAction('left')}
              activeOpacity={0.8}
            >
              <X color="#ef4444" size={26} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionBtn, isCompactScreen && styles.actionBtnCompact, styles.likeBtn, { backgroundColor: themeColors.card }]}
              onPress={() => handleAction('right')}
              activeOpacity={0.8}
            >
              <Heart color="#10b981" size={26} fill="#10b981" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, isCompactScreen && styles.actionBtnCompact, styles.explanationBtn, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
              onPress={() => setCompatibilityInfoVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Voir l’explication de la compatibilité"
              activeOpacity={0.8}
            >
              <Text style={[styles.explanationButtonText, { color: themeColors.accent }]}>?</Text>
            </TouchableOpacity>
          </View>
        )}

        <Modal visible={filterVisible} animationType="slide" transparent={true}>
          {/* Racine gestes obligatoire : le Modal est une feneree separee sur
              Android, le RangeSlider n'y porterait pas sans elle. */}
          <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, isCompactScreen && styles.modalContentCompact, { backgroundColor: themeColors.bgCard }]}>
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
                    style={[styles.filterOption, { backgroundColor: themeColors.inputBg }]}
                    onPress={() => setCityModalVisible(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: themeColors.text }}>
                      {draftFilters.city || 'Toutes les villes'}
                    </Text>
                  </TouchableOpacity>
                  <Text style={[styles.filterHint, { color: themeColors.textMuted }]}>
                    Les suggestions et les villes restent limitées au pays de ton profil.
                  </Text>
                </View>

                <View style={styles.filterSection}>
                  <View style={styles.ageHeaderRow}>
                    <Text style={[styles.filterLabel, { color: themeColors.textMuted }]}>Âge</Text>
                    <Text style={[styles.ageRangeValue, { color: themeColors.text }]}>
                      {draftFilters.ageMin} – {draftFilters.ageMax} ans
                    </Text>
                  </View>
                  <RangeSlider
                    min={ageBounds.min}
                    max={ageBounds.max}
                    low={draftFilters.ageMin}
                    high={draftFilters.ageMax}
                    onChange={setDraftAgeRange}
                    accentColor={themeColors.accent}
                    trackColor={themeColors.border}
                    thumbColor={themeColors.bgCard}
                  />
                </View>

                <Text style={[styles.filterHint, { color: themeColors.textMuted }]}>Les informations médicales restent privées avant un match réciproque.</Text>

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
                  onPress={() => setDraftFilters({ ...filterDefaults })}
                >
                  <Text style={[styles.resetBtnText, { color: themeColors.textMuted }]}>
                    Réinitialiser les filtres
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
          </GestureHandlerRootView>
        </Modal>

        <Modal
          visible={compatibilityInfoVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setCompatibilityInfoVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.compatibilityModal, { backgroundColor: themeColors.bgCard }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>La règle de compatibilité</Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Fermer"
                  onPress={() => setCompatibilityInfoVisible(false)}
                  hitSlop={10}
                >
                  <X color={themeColors.text} size={24} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.compatibilityBody, { color: themeColors.text }]}>
                {viewerGenotype?.toUpperCase() === 'AA'
                  ? 'Ton génotype est AA. Géno peut te proposer des profils AA, AS, AC, SS, SC et CC.'
                  : viewerGenotype
                    ? `Ton génotype est ${viewerGenotype.toUpperCase()}. Géno te propose uniquement des profils AA.`
                    : 'Ton génotype n’est pas renseigné. Pour le moment, Géno te propose uniquement des profils AA.'}
              </Text>
              <Text style={[styles.compatibilityDisclaimer, { color: themeColors.textMuted }]}>
                Cette règle explique le filtrage des profils dans Géno. Elle ne remplace pas l’avis d’un professionnel de santé.
              </Text>
              <TouchableOpacity
                style={[styles.applyBtn, { backgroundColor: themeColors.accent }]}
                onPress={() => setCompatibilityInfoVisible(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.applyBtnText}>Compris</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <CityPickerModal
          visible={cityModalVisible}
          selectedCity={draftFilters.city}
          countryCode={viewerCountry}
          title="Ville"
          showAllCitiesOption
          allCitiesLabel="Toutes les villes"
          placeholder="Rechercher une ville"
          emptyMessage="Aucune ville trouvée"
          theme={{
            text: themeColors.text,
            textMuted: themeColors.textMuted,
            bgCard: themeColors.bgCard,
            border: themeColors.border,
            inputBg: themeColors.inputBg,
            accent: themeColors.accent,
          }}
          onSelect={selectCity}
          onClose={() => setCityModalVisible(false)}
        />

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

              {/* Ouvre la conversation du match (l ancien code fermait juste). */}
              <TouchableOpacity
                style={styles.matchMessageBtn}
                onPress={() => {
                  const target = showMatch;
                  setShowMatch(null);
                  if (!target?.matchId || !target.partner) return;
                  router.push({
                    pathname: '/chat/[id]',
                    params: {
                      id: target.matchId,
                      partnerUserId: target.partner.user_id,
                      partnerName: target.partner.first_name,
                      partnerPhotos: JSON.stringify(target.partner.photos || []),
                      partnerVerified: isFullyVerified(target.partner)
                        ? 'full'
                        : target.partner.identity_verified
                          ? 'id'
                          : 'none',
                    },
                  });
                }}
              >
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
  headerCompact: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 4 },
  headerTitle: { fontSize: 28, fontWeight: 'bold' },
  headerTitleCompact: { fontSize: 24 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  likesShortcut: { height: 44, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, position: 'relative' },
  likesShortcutText: { fontSize: 13, fontWeight: '700' },
  likesCountBadge: { position: 'absolute', top: -7, right: -7, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4, backgroundColor: '#f43f5e', borderWidth: 1.5, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  likesCountBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  headerSub: { fontSize: 14, opacity: 0.7 },
  headerSubCompact: { fontSize: 12 },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContainer: { flex: 1, padding: 16, justifyContent: 'center' },
  cardContainerCompact: { paddingHorizontal: 10, paddingVertical: 8 },
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
  cardGradientCompact: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 62 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 },
  name: { color: '#ffffff', fontSize: 32, fontWeight: 'bold' },
  nameCompact: { fontSize: 27, flexShrink: 1 },
  age: { color: '#ffffff', fontSize: 24, fontWeight: '400' },
  ageCompact: { fontSize: 20 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  locationRowCompact: { marginBottom: 7 },
  city: { color: '#e5e7eb', fontSize: 16 },
  cityCompact: { fontSize: 14, flexShrink: 1 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  tagCompact: { paddingHorizontal: 9, paddingVertical: 4 },
  tagText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  interestsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  interestsRowCompact: { gap: 4, marginBottom: 6 },
  interestChip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  interestChipText: { color: '#f9fafb', fontSize: 11, fontWeight: '600' },
  infoIcon: { position: 'absolute', right: 24, bottom: 24, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  infoIconCompact: { right: 16, bottom: 16, width: 38, height: 38, borderRadius: 19 },
  buttonsContainer: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingBottom: 24, 
    paddingTop: 8, 
    gap: 24
  },
  buttonsContainerCompact: { paddingTop: 4, paddingBottom: 8, gap: 14 },
  actionBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center', 
    alignItems: 'center', 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 8 }, 
    shadowOpacity: 0.15, 
    shadowRadius: 12, 
    elevation: 8 
  },
  actionBtnCompact: { width: 50, height: 50, borderRadius: 25 },
  dislikeBtn: { borderColor: '#ef4444', borderWidth: 2 },
  likeBtn: { borderColor: '#10b981', borderWidth: 2 },
  explanationBtn: { borderWidth: 1.5 },
  explanationButtonText: { fontSize: 28, lineHeight: 32, fontWeight: '800' },
  // Pastille blanche semi-opaque : le vert/rouge reste lisible sur TOUTES les
  // photos (le texte seul se fondait dans les fonds clairs). Rotation conservee.
  stamp: {
    position: 'absolute',
    top: 120,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 6,
    backgroundColor: 'rgba(255,255,255,0.88)',
    transform: [{ rotate: '-20deg' }],
    zIndex: 10,
  },
  stampLike: { left: 40, borderColor: '#10b981' },
  stampTextLike: { color: '#16a34a', fontSize: 32, fontWeight: 'bold', letterSpacing: 3 },
  stampNope: { right: 40, borderColor: '#ef4444', transform: [{ rotate: '20deg' }] },
  stampTextNope: { color: '#dc2626', fontSize: 32, fontWeight: 'bold', letterSpacing: 3 },
  undoRow: { alignItems: 'center', paddingBottom: 4 },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  undoText: { fontSize: 14, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 32, maxHeight: '80%' },
  modalContentCompact: { padding: 20, maxHeight: '90%' },
  compatibilityModal: { width: '90%', alignSelf: 'center', borderRadius: 24, padding: 24 },
  compatibilityBody: { fontSize: 16, lineHeight: 24, marginBottom: 14 },
  compatibilityDisclaimer: { fontSize: 13, lineHeight: 19, marginBottom: 8 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  modalTitle: { fontSize: 24, fontWeight: 'bold' },
  filterSection: { marginBottom: 24 },
  filterLabel: { fontSize: 14, fontWeight: '600', marginBottom: 12, textTransform: 'uppercase' },
  filterHint: { fontSize: 12, lineHeight: 18, marginTop: 10 },
  filterOption: { padding: 16, borderRadius: 12 },
  filterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, minWidth: 60, alignItems: 'center' },
  ageHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  ageRangeValue: { fontSize: 15, fontWeight: '700' },
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
