import { EmptyState } from '@/components/empty-state';
import { useProfileSheet } from '@/contexts/ProfileSheetContext';
import { IMAGE_CACHE_POLICY, imageSource } from '@/lib/images';
import { fetchCandidateProfiles, matchesTargetGender, isAgeInRange } from '@/lib/candidates';
import { getUser } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { Heart, Sparkles, WifiOff } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type DiscoverMode = 'everyone' | 'forYou';

type DiscoverProfile = {
  user_id: string;
  first_name: string | null;
  age: number | null;
  city: string | null;
  interests: string[] | null;
  photos: string[] | null;
  profession: string | null;
  bio: string | null;
  identity_verified: boolean;
  genotype_verified: boolean;
  [key: string]: any;
};

const DEFAULT_FILTERS = { ageMin: 18, ageMax: 80, city: '' };

function rankSuggestions(profiles: DiscoverProfile[], city: string, interests: string[]) {
  const normalizedCity = city.trim().toLocaleLowerCase();
  const normalizedInterests = new Set(interests.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean));

  return profiles
    .map((profile, index) => {
      const sharedInterests = (profile.interests || []).filter((value) =>
        normalizedInterests.has(value.trim().toLocaleLowerCase())
      ).length;
      const sameCity = !!normalizedCity && profile.city?.trim?.().toLocaleLowerCase() === normalizedCity;
      return { profile, index, score: sharedInterests * 3 + (sameCity ? 2 : 0) };
    })
    .sort((first, second) => second.score - first.score || first.index - second.index)
    .map(({ profile }) => profile);
}

export default function DiscoverScreen() {
  const isDark = useColorScheme() === 'dark';
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const { openProfileSheet } = useProfileSheet();
  const [mode, setMode] = useState<DiscoverMode>('everyone');
  const [profiles, setProfiles] = useState<DiscoverProfile[]>([]);
  const [viewerCity, setViewerCity] = useState('');
  const [viewerInterests, setViewerInterests] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  const requestInFlight = useRef(false);
  const actionInFlight = useRef(false);
  const loadMoreInFlight = useRef(false);
  const hasMore = useRef(false);
  const cursor = useRef<string | null>(null);
  const viewerGender = useRef<string | null>(null);

  const colors = {
    bg: isDark ? '#111827' : '#f8f8fb',
    card: isDark ? '#1f2937' : '#ffffff',
    text: isDark ? '#f9fafb' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
    border: isDark ? '#374151' : '#e5e7eb',
    accent: '#e91e63',
  };

  const loadProfiles = useCallback(async (isRefresh = false) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    try {
      const user = await getUser();
      if (!user) throw new Error('Session absente');
      const { data: ownProfile, error: ownError } = await supabase.rpc('get_my_profile').single();
      if (ownError) throw ownError;
      const own = ownProfile as { gender?: string | null; city?: string | null; interests?: string[] | null } | null;
      const city = own?.city || '';
      const interests = Array.isArray(own?.interests) ? own.interests : [];
      setViewerCity(city);
      setViewerInterests(interests);
      viewerGender.current = own?.gender ?? null;

      const page = await fetchCandidateProfiles({
        userId: user.id,
        limit: 50,
        after: null,
        filters: DEFAULT_FILTERS,
        viewerGender: own?.gender ?? null,
      });
      cursor.current = page.cursor;
      hasMore.current = page.profiles.length === 50;
      const eligible = page.profiles.filter((profile) =>
        isAgeInRange(profile.age, DEFAULT_FILTERS.ageMin, DEFAULT_FILTERS.ageMax) &&
        matchesTargetGender(profile.gender, own?.gender ?? null)
      ) as DiscoverProfile[];
      setProfiles(eligible);
    } catch {
      setLoadError('Impossible de charger les profils. Vérifie ta connexion puis réessaie.');
    } finally {
      requestInFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadMoreProfiles = useCallback(async () => {
    if (loadMoreInFlight.current || !hasMore.current || !cursor.current) return;
    loadMoreInFlight.current = true;
    setLoadingMore(true);
    try {
      const user = await getUser();
      if (!user) return;
      const page = await fetchCandidateProfiles({
        userId: user.id,
        limit: 50,
        after: cursor.current,
        filters: DEFAULT_FILTERS,
        viewerGender: viewerGender.current,
      });
      cursor.current = page.cursor;
      hasMore.current = page.profiles.length === 50;
      const eligible = page.profiles.filter((profile) =>
        isAgeInRange(profile.age, DEFAULT_FILTERS.ageMin, DEFAULT_FILTERS.ageMax) &&
        matchesTargetGender(profile.gender, viewerGender.current)
      ) as DiscoverProfile[];
      if (eligible.length > 0) setProfiles((current) => [...current, ...eligible]);
    } catch {
      // Le contenu déjà chargé reste consultable même si la page suivante échoue.
    } finally {
      loadMoreInFlight.current = false;
      setLoadingMore(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadProfiles();
  }, [loadProfiles]));

  const recommendations = useMemo(
    () => rankSuggestions(profiles, viewerCity, viewerInterests),
    [profiles, viewerCity, viewerInterests]
  );
  const cardWidth = Math.floor((width - 48) / 3);
  const recommendationPhotoHeight = Math.min(440, Math.max(320, height * 0.5));

  const sendResponse = async (profile: DiscoverProfile, direction: 'like' | 'dislike') => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusyProfileId(profile.user_id);
    try {
      const user = await getUser();
      if (!user) throw new Error('Session absente');
      const { error } = await supabase.from('swipes').insert({
        swiper_id: user.id,
        swiped_id: profile.user_id,
        direction,
      });
      if (error) throw error;

      setProfiles((current) => current.filter((item) => item.user_id !== profile.user_id));
      if (direction === 'like') {
        const { data: match, error: matchError } = await supabase
          .from('matches')
          .select('id')
          .or(`and(user_id_1.eq.${user.id},user_id_2.eq.${profile.user_id}),and(user_id_1.eq.${profile.user_id},user_id_2.eq.${user.id})`)
          .maybeSingle();
        if (matchError) {
          Alert.alert('Like envoyé', 'Ta réponse est enregistrée. Recharge la page pour vérifier si vous avez un match.');
        } else if (match) {
          Alert.alert('C’est un match !', `Vous et ${profile.first_name || 'cette personne'} vous plaisez mutuellement.`, [
            { text: 'Plus tard', style: 'cancel' },
            { text: 'Envoyer un message', onPress: () => router.push({ pathname: '/chat/[id]', params: { id: match.id, partnerUserId: profile.user_id, partnerName: profile.first_name || 'Utilisateur', partnerPhotos: JSON.stringify(profile.photos || []) } } as any) },
          ]);
        } else {
          Alert.alert('Like envoyé', 'Ta réponse est enregistrée. Si cette personne t’a aussi aimé, un match apparaîtra dans tes discussions.');
        }
      }
    } catch {
      Alert.alert('Action impossible', 'Nous n’avons pas pu enregistrer ta réponse. Réessaie dans un instant.');
    } finally {
      actionInFlight.current = false;
      setBusyProfileId(null);
    }
  };

  const renderEveryone = ({ item }: { item: DiscoverProfile }) => (
    <TouchableOpacity
      style={[styles.gridItem, { width: cardWidth }]}
      onPress={() => openProfileSheet(item)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Voir le profil de ${item.first_name || 'cette personne'}${item.age ? `, ${item.age} ans` : ''}`}
    >
      <Image source={imageSource(item.photos?.[0])} style={[styles.gridPhoto, { height: Math.round(cardWidth * 1.28) }]} contentFit="cover" cachePolicy={IMAGE_CACHE_POLICY} />
      <Text style={[styles.gridName, { color: colors.text }]} numberOfLines={1}>
        {item.first_name || 'Utilisateur'}{item.age != null ? `, ${item.age}` : ''}
      </Text>
      {!!item.city && <Text style={[styles.gridCity, { color: colors.muted }]} numberOfLines={1}>{item.city}</Text>}
    </TouchableOpacity>
  );

  const renderRecommendation = ({ item, index }: { item: DiscoverProfile; index: number }) => {
    const ownInterestSet = new Set(viewerInterests.map((value) => value.trim().toLocaleLowerCase()));
    const sharedInterests = (item.interests || []).filter((value) => ownInterestSet.has(value.trim().toLocaleLowerCase()));
    const pending = busyProfileId === item.user_id;

    return (
      <View style={[styles.recommendationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => openProfileSheet(item)} activeOpacity={0.9} accessibilityRole="button" accessibilityLabel={`Voir le profil de ${item.first_name || 'cette personne'}`}>
          <View style={[styles.recommendationPhotoWrap, { height: recommendationPhotoHeight }]}>
            <Image source={imageSource(item.photos?.[0])} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy={IMAGE_CACHE_POLICY} />
            <LinearGradient colors={['rgba(0,0,0,0.22)', 'transparent', 'rgba(0,0,0,0.78)']} locations={[0, 0.3, 1]} style={StyleSheet.absoluteFill} />
            <View style={styles.recommendationTop}>
              <View style={styles.recommendationTitleBlock}>
                <Text style={styles.recommendationName} numberOfLines={1}>
                  {item.first_name || 'Utilisateur'}{item.age != null ? `, ${item.age}` : ''}
                </Text>
                {!!item.city && <Text style={styles.recommendationCity}>{item.city}</Text>}
              </View>
              <View style={styles.suggestionNumber}><Text style={styles.suggestionNumberText}>{index + 1}</Text></View>
            </View>
            <View style={styles.recommendationBottom}>
              {sharedInterests.length > 0 ? (
                <Text style={styles.sharedInterests} numberOfLines={1}>En commun : {sharedInterests.slice(0, 3).join(' · ')}</Text>
              ) : (
                <Text style={styles.sharedInterests}>Une personne à découvrir</Text>
              )}
              <Text style={styles.recommendationBio} numberOfLines={2}>{item.bio || item.profession || 'Découvre son profil pour en savoir plus.'}</Text>
            </View>
          </View>
        </TouchableOpacity>
        <View style={styles.recommendationActions}>
          <TouchableOpacity
            style={[styles.secondaryAction, { borderColor: colors.border }]}
            onPress={() => openProfileSheet(item)}
            activeOpacity={0.8}
          >
            <Text style={[styles.secondaryActionText, { color: colors.text }]}>Voir le profil</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.likeAction, { backgroundColor: colors.accent, opacity: pending ? 0.55 : 1 }]}
            onPress={() => void sendResponse(item, 'like')}
            disabled={pending}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Aimer le profil de ${item.first_name || 'cette personne'}`}
          >
            {pending ? <ActivityIndicator size="small" color="#fff" /> : <Heart color="#fff" size={20} fill="#fff" />}
            <Text style={styles.likeActionText}>J’aime</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const listHeader = mode === 'forYou' ? (
    <View style={styles.suggestionsIntro}>
      <Text style={[styles.suggestionsTitle, { color: colors.text }]}>Suggestions du jour</Text>
      <Text style={[styles.suggestionsDescription, { color: colors.muted }]}>Des profils qui partagent ta ville ou tes centres d’intérêt, toujours selon les règles de compatibilité Géno.</Text>
    </View>
  ) : null;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Profils à découvrir</Text>
        </View>
        <TouchableOpacity
          style={[styles.headerButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push('/received-likes')}
          accessibilityRole="button"
          accessibilityLabel="Voir les likes reçus"
        >
          <Heart size={20} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[styles.tab, mode === 'everyone' && { borderBottomColor: colors.text }]} onPress={() => setMode('everyone')} accessibilityRole="tab" accessibilityState={{ selected: mode === 'everyone' }}>
          <Text style={[styles.tabText, { color: mode === 'everyone' ? colors.text : colors.muted }]}>Tout le monde</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, mode === 'forYou' && { borderBottomColor: colors.text }]} onPress={() => setMode('forYou')} accessibilityRole="tab" accessibilityState={{ selected: mode === 'forYou' }}>
          <Text style={[styles.tabText, { color: mode === 'forYou' ? colors.text : colors.muted }]}>Pour vous</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : loadError ? (
        <EmptyState isError icon={<WifiOff color={colors.muted} size={44} />} title="Chargement impossible" message={loadError} actionLabel="Réessayer" onAction={() => void loadProfiles()} />
      ) : profiles.length === 0 ? (
        <EmptyState icon={<Sparkles color={colors.accent} size={42} />} title="Pas encore de profil à proposer" message="De nouveaux profils apparaîtront ici dès qu’ils correspondront à tes critères et aux règles de compatibilité Géno." actionLabel="Actualiser" onAction={() => void loadProfiles(true)} />
      ) : mode === 'everyone' ? (
        <FlatList
          key="everyone-grid"
          data={profiles}
          numColumns={3}
          renderItem={renderEveryone}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadProfiles(true)} tintColor={colors.accent} />}
          onEndReached={() => void loadMoreProfiles()}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.accent} style={{ paddingVertical: 12 }} /> : undefined}
        />
      ) : (
        <FlatList
          key="for-you-list"
          data={recommendations}
          numColumns={1}
          renderItem={renderRecommendation}
          keyExtractor={(item) => item.user_id}
          ListHeaderComponent={listHeader ?? undefined}
          contentContainerStyle={styles.recommendationList}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadProfiles(true)} tintColor={colors.accent} />}
          onEndReached={() => void loadMoreProfiles()}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.accent} style={{ paddingVertical: 12 }} /> : undefined}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { minHeight: 58, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 27, fontWeight: '800', letterSpacing: -0.5 },
  headerButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tabs: { height: 52, paddingHorizontal: 20, flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabText: { fontSize: 15, fontWeight: '800' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  gridContent: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 22 },
  gridRow: { justifyContent: 'space-between', marginBottom: 18 },
  gridItem: { minWidth: 0 },
  gridPhoto: { width: '100%', borderRadius: 18, backgroundColor: '#e5e7eb' },
  gridName: { marginTop: 7, fontSize: 13, lineHeight: 17, fontWeight: '700' },
  gridCity: { marginTop: 1, fontSize: 11, lineHeight: 15 },
  suggestionsIntro: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 14 },
  suggestionsTitle: { fontSize: 23, fontWeight: '800', marginBottom: 7 },
  suggestionsDescription: { fontSize: 15, lineHeight: 22 },
  recommendationList: { paddingHorizontal: 16, paddingBottom: 24 },
  recommendationCard: { borderRadius: 22, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, marginBottom: 18 },
  recommendationPhotoWrap: { width: '100%', backgroundColor: '#d1d5db', justifyContent: 'space-between' },
  recommendationTop: { padding: 17, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  recommendationTitleBlock: { flex: 1 },
  recommendationName: { color: '#fff', fontSize: 25, fontWeight: '800' },
  recommendationCity: { color: '#fff', fontSize: 14, marginTop: 3 },
  suggestionNumber: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.42)', alignItems: 'center', justifyContent: 'center' },
  suggestionNumberText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  recommendationBottom: { padding: 17, gap: 6 },
  sharedInterests: { color: '#fff', fontSize: 13, fontWeight: '700' },
  recommendationBio: { color: '#f3f4f6', fontSize: 14, lineHeight: 19 },
  recommendationActions: { padding: 12, flexDirection: 'row', gap: 10 },
  secondaryAction: { flex: 1, height: 46, borderWidth: 1, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  secondaryActionText: { fontSize: 14, fontWeight: '700' },
  likeAction: { flex: 1, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  likeActionText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
