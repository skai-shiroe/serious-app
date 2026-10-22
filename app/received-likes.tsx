import { EmptyState } from '@/components/empty-state';
import { useProfileSheet } from '@/contexts/ProfileSheetContext';
import { photoSource, prefetchImages } from '@/lib/images';
import { getUser } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, Heart, MapPin, WifiOff, X } from 'lucide-react-native';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PAGE_SIZE = 20;
type ReceivedLikesUsageAction = 'page_opened' | 'profile_opened' | 'response_like' | 'response_pass';

async function trackUsage(userId: string, action: ReceivedLikesUsageAction) {
  try {
    await supabase.from('feature_usage_events').insert({
      user_id: userId,
      feature: 'received_likes',
      action,
    });
  } catch {
    // Les statistiques ne doivent pas empêcher l'utilisation de la page.
  }
}

type ReceivedLike = {
  id: string;
  user_id: string;
  gender: string | null;
  city: string | null;
  religion: string | null;
  profession: string | null;
  interests: string[] | null;
  blood_type: string | null;
  sickle_cell: string | null;
  bio: string | null;
  photos: string[] | null;
  created_at: string;
  updated_at: string;
  first_name: string | null;
  last_name: string | null;
  identity_verified: boolean;
  genotype_verified: boolean;
  country_code: string | null;
  age: number | null;
  liked_at: string;
};

function relativeLikeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'À l’instant';
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Il y a ${days} j`;
  return new Date(value).toLocaleDateString();
}

export default function ReceivedLikesScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const { openProfileSheet } = useProfileSheet();
  const [likes, setLikes] = useState<ReceivedLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const likesRef = useRef<ReceivedLike[]>([]);
  const requestInFlightRef = useRef(false);
  const actionInFlightRef = useRef(false);

  const colors = {
    bg: isDark ? '#111827' : '#f8f8fb',
    card: isDark ? '#1f2937' : '#ffffff',
    text: isDark ? '#f9fafb' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
    border: isDark ? '#374151' : '#e5e7eb',
    accent: '#e91e63',
  };

  const loadLikes = useCallback(async (reset = false) => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    if (reset) setLoading(true);
    else setLoadingMore(true);
    setLoadError(null);

    try {
      const user = await getUser();
      if (!user) throw new Error('Session absente');
      const offset = reset ? 0 : likesRef.current.length;
      const { data, error } = await supabase.rpc('get_received_likes', {
        p_limit: PAGE_SIZE,
        p_offset: offset,
      });
      if (error) throw error;

      const page = (data || []) as ReceivedLike[];
      const next = reset ? page : [...likesRef.current, ...page];
      likesRef.current = next;
      setLikes(next);
      setHasMore(page.length === PAGE_SIZE);
      prefetchImages(page.map((item) => item.photos?.[0]));
    } catch {
      setLoadError('Impossible de charger les likes reçus. Vérifie ta connexion puis réessaie.');
    } finally {
      requestInFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void getUser()
      .then((user) => {
        if (user) void trackUsage(user.id, 'page_opened');
      })
      .catch(() => undefined);
    void loadLikes(true);
  }, [loadLikes]));

  const respondToLike = async (profile: ReceivedLike, direction: 'like' | 'dislike') => {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setBusyUserId(profile.user_id);
    try {
      const user = await getUser();
      if (!user) throw new Error('Session absente');
      const { error } = await supabase.from('swipes').insert({
        swiper_id: user.id,
        swiped_id: profile.user_id,
        direction,
      });
      if (error) throw error;
      void trackUsage(user.id, direction === 'like' ? 'response_like' : 'response_pass');

      const next = likesRef.current.filter((item) => item.user_id !== profile.user_id);
      likesRef.current = next;
      setLikes(next);
      if (next.length === 0 && hasMore) void loadLikes(true);

      if (direction === 'like') {
        const { data: match, error: matchError } = await supabase
          .from('matches')
          .select('id')
          .or(`and(user_id_1.eq.${user.id},user_id_2.eq.${profile.user_id}),and(user_id_1.eq.${profile.user_id},user_id_2.eq.${user.id})`)
          .maybeSingle();
        if (matchError) {
          Alert.alert('Like envoyé', 'Ta réponse est enregistrée. Le statut du match n’a pas pu être actualisé; recharge la page dans un instant.');
          return;
        }
        if (match) {
          Alert.alert('C’est un match !', `Vous et ${profile.first_name || 'cette personne'} vous plaisez mutuellement.`, [
            { text: 'Plus tard', style: 'cancel' },
            {
              text: 'Envoyer un message',
              onPress: () => router.push({
                pathname: '/chat/[id]',
                params: {
                  id: match.id,
                  partnerUserId: profile.user_id,
                  partnerName: profile.first_name || 'Utilisateur',
                  partnerPhotos: JSON.stringify(profile.photos || []),
                  partnerVerified: profile.identity_verified && profile.genotype_verified ? 'full' : profile.identity_verified ? 'id' : '',
                },
              } as any),
            },
          ]);
        }
      }
    } catch {
      Alert.alert('Action impossible', 'Nous n’avons pas pu enregistrer ta réponse. Réessaie dans un instant.');
    } finally {
      actionInFlightRef.current = false;
      setBusyUserId(null);
    }
  };

  const renderLike = ({ item }: { item: ReceivedLike }) => {
    const pending = busyUserId === item.user_id;
    return (
      <View style={[styles.likeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            void getUser().then((user) => {
              if (user) void trackUsage(user.id, 'profile_opened');
            }).catch(() => undefined);
            openProfileSheet({ ...item, first_name: item.first_name || 'Utilisateur' });
          }}
          style={styles.profileRow}
          accessibilityRole="button"
          accessibilityLabel={`Voir le profil de ${item.first_name || 'cette personne'}`}
        >
          <Image source={photoSource(item.photos)} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
          <View style={styles.profileText}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {item.first_name || 'Utilisateur'}{item.age != null ? `, ${item.age}` : ''}
              </Text>
            </View>
            {!!item.city && (
              <View style={styles.cityRow}>
                <MapPin size={14} color={colors.muted} />
                <Text style={[styles.city, { color: colors.muted }]} numberOfLines={1}>{item.city}</Text>
              </View>
            )}
            <Text style={[styles.time, { color: colors.accent }]}>{relativeLikeTime(item.liked_at)}</Text>
          </View>
          <Text style={[styles.openHint, { color: colors.muted }]}>›</Text>
        </TouchableOpacity>

        {!!item.profession && <Text style={[styles.profession, { color: colors.muted }]} numberOfLines={1}>{item.profession}</Text>}

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.responseButton, styles.passButton, { borderColor: colors.border }]}
            onPress={() => void respondToLike(item, 'dislike')}
            disabled={!!busyUserId}
            accessibilityRole="button"
            accessibilityLabel="Passer ce profil"
          >
            {pending ? <ActivityIndicator size="small" color={colors.muted} /> : <X size={18} color={colors.muted} />}
            <Text style={[styles.responseText, { color: colors.muted }]}>Passer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.responseButton, styles.likeButton, { backgroundColor: colors.accent }]}
            onPress={() => void respondToLike(item, 'like')}
            disabled={!!busyUserId}
            accessibilityRole="button"
            accessibilityLabel="Liker ce profil en retour"
          >
            {pending ? <ActivityIndicator size="small" color="#fff" /> : <Heart size={17} color="#fff" fill="#fff" />}
            <Text style={[styles.responseText, { color: '#fff' }]}>Liker en retour</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const listHeader = (
    <View style={[styles.introCard, { backgroundColor: isDark ? '#3a1d2b' : '#fff0f5' }]}>
      <View style={[styles.introIcon, { backgroundColor: colors.accent }]}><Heart size={18} color="#fff" fill="#fff" /></View>
      <View style={styles.introCopy}>
        <Text style={[styles.introTitle, { color: colors.text }]}>Ils ont aimé ton profil</Text>
        <Text style={[styles.introText, { color: colors.muted }]}>Découvre leur profil et like en retour pour créer un match.</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Retour">
          <ArrowLeft size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Likes reçus</Text>
          <Text style={[styles.headerSubtitle, { color: colors.muted }]}>{likes.length}{hasMore ? '+' : ''} profil{likes.length > 1 || hasMore ? 's' : ''} en attente</Text>
        </View>
        <View style={{ width: 42 }} />
      </View>

      {loading && likes.length === 0 ? (
        <View style={styles.loadingState}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : loadError && likes.length === 0 ? (
        <EmptyState
          isError
          icon={<WifiOff color={colors.muted} size={44} />}
          title="Chargement impossible"
          message={loadError}
          actionLabel="Réessayer"
          onAction={() => void loadLikes(true)}
        />
      ) : likes.length === 0 ? (
        <View style={styles.emptyWrap}>
          {listHeader}
          <EmptyState
            icon={<Heart color={colors.accent} size={44} />}
            title="Pas encore de likes"
            message="Quand une personne aimera ton profil, tu pourras la découvrir ici."
            actionLabel="Continuer à découvrir"
            onAction={() => router.back()}
          />
        </View>
      ) : (
        <FlatList
          data={likes}
          keyExtractor={(item) => item.user_id}
          renderItem={renderLike}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.accent} onRefresh={() => { setRefreshing(true); void loadLikes(true); }} />}
          onEndReached={() => { if (hasMore && !loadingMore) void loadLikes(false); }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerLoader} color={colors.accent} /> : null}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 12 },
  backButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 21, fontWeight: '800' },
  headerSubtitle: { fontSize: 12, marginTop: 2 },
  listContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 },
  introCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20, marginBottom: 14, gap: 12 },
  introIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  introCopy: { flex: 1 },
  introTitle: { fontSize: 15, fontWeight: '800', marginBottom: 3 },
  introText: { fontSize: 13, lineHeight: 18 },
  likeCard: { borderWidth: 1, borderRadius: 22, padding: 14, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 74, height: 88, borderRadius: 16, backgroundColor: '#e5e7eb' },
  profileText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { fontSize: 18, fontWeight: '800', flexShrink: 1 },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  city: { fontSize: 13, flexShrink: 1 },
  time: { fontSize: 12, fontWeight: '700', marginTop: 7 },
  openHint: { fontSize: 28, paddingHorizontal: 2 },
  profession: { marginTop: 10, fontSize: 13 },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  responseButton: { minHeight: 44, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12 },
  passButton: { flex: 0.8, borderWidth: 1 },
  likeButton: { flex: 1.4 },
  responseText: { fontSize: 13, fontWeight: '800' },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },
  footerLoader: { padding: 16 },
});
