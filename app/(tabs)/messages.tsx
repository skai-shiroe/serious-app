import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useCallback, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  useColorScheme, 
  ActivityIndicator,
  RefreshControl 
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { supabase } from '@/lib/supabase';
import { getUser } from '@/lib/session';
import { IMAGE_CACHE_POLICY, photoSource, prefetchImages } from '@/lib/images';
import { isRecentlySeen } from '@/hooks/use-presence';
import { EmptyState } from '@/components/empty-state';
import {
  CertifiedPhotoBadge,
  IdentityVerifiedIcon,
  isFullyVerified,
} from '@/components/verified-badge';
import { MessageCircle, WifiOff } from 'lucide-react-native';

// Helper pour le temps relatif simplifié
const getRelativeTime = (dateString: string) => {
  const now = new Date();
  const date = new Date(dateString);
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "À l'instant";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}min`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}j`;
  return date.toLocaleDateString();
};

interface Conversation {
  id: string; // match_id
  otherUser: {
    id: string;
    first_name: string;
    photos: string[];
    identity_verified?: boolean;
    genotype_verified?: boolean;
    last_seen?: string;
  };
  lastMessage?: {
    content: string;
    created_at: string;
    sender_id: string;
  };
  unreadCount: number;
  isOnline: boolean;
}

export default function MessagesScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  // Distingue « aucun match » (liste vide) de « chargement echoue »
  const [loadError, setLoadError] = useState<string | null>(null);

  const themeColors = {
    text: isDark ? '#ffffff' : '#111827',
    textMuted: isDark ? '#9ca3af' : '#6b7280',
    bg: isDark ? '#111827' : '#ffffff',
    border: isDark ? '#374151' : '#f3f4f6',
    card: isDark ? '#1f2937' : '#ffffff',
  };

  const fetchConversations = useCallback(async () => {
    try {
      setLoadError(null);
      const user = await getUser();
      if (!user) return;

      // 1. Récupérer tous les matches de l'utilisateur
      const { data: matches, error: matchError } = await supabase
        .from('matches')
        .select('*')
        .or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`);

      if (matchError) throw matchError;

      if (!matches || matches.length === 0) {
        setConversations([]);
        return;
      }

      const matchIds = matches.map((m) => m.id);
      const otherUserIds = matches.map((m) =>
        m.user_id_1 === user.id ? m.user_id_2 : m.user_id_1
      );

      // 2. Profils + présences + compteurs de non-lus : 3 requêtes groupées
      //    (auparavant : 4 requêtes séquentielles par conversation)
      const [profilesRes, presenceRes, unreadRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, first_name, photos, identity_verified, genotype_verified')
          .in('user_id', otherUserIds),
        supabase
          .from('presence')
          .select('user_id, last_seen')
          .in('user_id', otherUserIds),
        supabase
          .from('messages')
          .select('match_id')
          .in('match_id', matchIds)
          .eq('read', false)
          .neq('sender_id', user.id),
      ]);

      const profilesById = new Map<string, any>(
        (profilesRes.data || []).map((p: any) => [p.user_id, p])
      );
      const presenceById = new Map<string, any>(
        (presenceRes.data || []).map((p: any) => [p.user_id, p])
      );
      const unreadByMatch = new Map<string, number>();
      (unreadRes.data || []).forEach((m: any) => {
        unreadByMatch.set(m.match_id, (unreadByMatch.get(m.match_id) || 0) + 1);
      });

      // 3. Dernier message de chaque conversation : UNE seule requete via la RPC
      //    get_last_messages (avant : une requete par conversation). Repli sur
      //    l'ancien comportement tant que la fonction SQL n'est pas deployee.
      let lastMessages: any[] = [];
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_last_messages', {
        match_ids: matchIds,
      });

      if (!rpcError && rpcData) {
        lastMessages = rpcData;
      } else {
        if (rpcError) {
          console.warn('[Messages] RPC get_last_messages indisponible :', rpcError.message);
        }
        lastMessages = await Promise.all(
          matchIds.map(async (matchId) => {
            const { data } = await supabase
              .from('messages')
              .select('match_id, content, created_at, sender_id')
              .eq('match_id', matchId)
              .order('created_at', { ascending: false })
              .limit(1);
            return data?.[0];
          })
        );
      }

      const lastByMatch = new Map<string, any>();
      lastMessages.filter(Boolean).forEach((m: any) => lastByMatch.set(m.match_id, m));

      const convs: Conversation[] = matches.map((match, index) => {
        const otherUserId = otherUserIds[index];
        const profile = profilesById.get(otherUserId);
        const presence = presenceById.get(otherUserId);

        return {
          id: match.id,
          otherUser: {
            id: otherUserId,
            first_name: profile?.first_name || 'Utilisateur',
            photos: profile?.photos || [],
            identity_verified: profile?.identity_verified === true,
            genotype_verified: profile?.genotype_verified === true,
            last_seen: presence?.last_seen,
          },
          lastMessage: lastByMatch.get(match.id),
          unreadCount: unreadByMatch.get(match.id) || 0,
          isOnline: isRecentlySeen(presence?.last_seen),
        };
      });

      // Trier par date du dernier message
      convs.sort((a, b) => {
        const timeA = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
        const timeB = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
        return timeB - timeA;
      });

      setConversations(convs);

      // Avatars precharges en memoire : la liste s'affiche sans flash gris
      prefetchImages(convs.map((c) => c.otherUser.photos?.[0]));
    } catch (error) {
      console.error('Error fetching conversations:', error);
      setLoadError(
        'Impossible de charger vos conversations. Vérifiez votre connexion puis réessayez.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Rechargement au focus + TEMPS REEL (plus de polling toutes les 30 s) :
  // nouveaux messages, presence et matchs mettent la liste a jour d'eux-memes,
  // avec un debounce pour eviter les rafales de requetes.
  useFocusEffect(
    useCallback(() => {
      void fetchConversations();

      let debounce: ReturnType<typeof setTimeout> | null = null;
      const refreshSoon = () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => { void fetchConversations(); }, 800);
      };

      const channel = supabase
        .channel('messages-tab')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, refreshSoon)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, refreshSoon)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'presence' }, refreshSoon)
        .subscribe();

      // Filet de securite, uniquement si l'ecran est au premier plan
      const fallback = setInterval(() => { void fetchConversations(); }, 90000);

      return () => {
        if (debounce) clearTimeout(debounce);
        clearInterval(fallback);
        supabase.removeChannel(channel);
      };
    }, [fetchConversations])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchConversations();
  };

  const renderItem = ({ item }: { item: Conversation }) => (
    <TouchableOpacity 
      style={[styles.chatItem, { borderBottomColor: themeColors.border }]}
      onPress={() => router.push(`/chat/${item.id}` as any)}
      activeOpacity={0.7}
    >
      <View>
        <Image
          source={photoSource(item.otherUser.photos)}
          style={styles.avatar}
          cachePolicy={IMAGE_CACHE_POLICY}
          recyclingKey={item.otherUser.id}
          transition={120}
        />
        {/* Pastille en haut-droit : le coin bas-droit est pris par le point
            « en ligne » (styles.onlineDot), rendu juste apres. */}
        {isFullyVerified(item.otherUser) && (
          <CertifiedPhotoBadge size={22} style={{ top: 0, right: 0 }} />
        )}
        {item.isOnline && <View style={styles.onlineDot} />}
      </View>
      
      <View style={styles.chatInfo}>
        <View style={styles.chatHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <Text style={[styles.name, { color: themeColors.text }]}>{item.otherUser.first_name}</Text>
            {!isFullyVerified(item.otherUser) && item.otherUser.identity_verified && (
              <IdentityVerifiedIcon size={15} />
            )}
          </View>
          {item.lastMessage && (
            <Text style={[styles.time, { color: item.unreadCount > 0 ? '#f43f5e' : themeColors.textMuted }]}>
              {getRelativeTime(item.lastMessage.created_at)}
            </Text>
          )}
        </View>
        
        <View style={styles.chatFooter}>
          <Text 
            style={[
              styles.lastMessage, 
              { 
                color: item.unreadCount > 0 ? themeColors.text : themeColors.textMuted, 
                fontWeight: item.unreadCount > 0 ? '600' : '400' 
              }
            ]} 
            numberOfLines={1}
          >
            {item.lastMessage ? item.lastMessage.content : 'Nouvelle affinité ! Dites bonjour 👋'}
          </Text>
          {item.unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: themeColors.text }]}>Messages</Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#f43f5e" />
        </View>
      ) : loadError && conversations.length === 0 ? (
        <EmptyState
          isError
          icon={<WifiOff color={themeColors.textMuted} size={48} />}
          title="Chargement impossible"
          message={loadError}
          actionLabel="Réessayer"
          onAction={() => fetchConversations()}
        />
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={<MessageCircle color="#f43f5e" size={48} />}
          title="Pas encore de match 💔"
          message="Continuez à swiper pour trouver votre compatibilité."
        />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f43f5e" />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { padding: 24, paddingTop: 16, paddingBottom: 16 },
  title: { fontSize: 32, fontWeight: 'bold' },
  listContent: { paddingHorizontal: 24, paddingBottom: 24 },
  chatItem: { flexDirection: 'row', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 62, height: 62, borderRadius: 31, marginRight: 16, backgroundColor: '#f3f4f6' },
  onlineDot: { 
    position: 'absolute', 
    bottom: 2, 
    right: 18, 
    width: 14, 
    height: 14, 
    borderRadius: 7, 
    backgroundColor: '#10b981', 
    borderWidth: 2, 
    borderColor: '#fff' 
  },
  chatInfo: { flex: 1, justifyContent: 'center' },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  name: { fontSize: 18, fontWeight: '700' },
  time: { fontSize: 13 },
  chatFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lastMessage: { flex: 1, fontSize: 15, paddingRight: 16 },
  badge: { backgroundColor: '#f43f5e', minWidth: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#ffffff', fontSize: 12, fontWeight: 'bold' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
});
