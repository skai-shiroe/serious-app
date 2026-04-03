import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState, useCallback } from 'react';
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

  const themeColors = {
    text: isDark ? '#ffffff' : '#111827',
    textMuted: isDark ? '#9ca3af' : '#6b7280',
    bg: isDark ? '#111827' : '#ffffff',
    border: isDark ? '#374151' : '#f3f4f6',
    card: isDark ? '#1f2937' : '#ffffff',
  };

  const fetchConversations = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Récupérer tous les matches
      const { data: matches, error: matchError } = await supabase
        .from('matches')
        .select('*')
        .or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`);

      if (matchError) throw matchError;

      const convs: Conversation[] = [];

      for (const match of matches || []) {
        const otherUserId = match.user_id_1 === user.id ? match.user_id_2 : match.user_id_1;

        // 2. Profil de l'autre utilisateur
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_id, first_name, photos')
          .eq('user_id', otherUserId)
          .single();

        // 3. Présence de l'autre utilisateur
        const { data: presence } = await supabase
          .from('presence')
          .select('last_seen')
          .eq('user_id', otherUserId)
          .maybeSingle();

        // 4. Dernier message
        const { data: lastMessages } = await supabase
          .from('messages')
          .select('content, created_at, sender_id')
          .eq('match_id', match.id)
          .order('created_at', { ascending: false })
          .limit(1);

        // 5. Messages non lus (envoyés par l'autre)
        const { count: unreadCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('match_id', match.id)
          .eq('read', false)
          .neq('sender_id', user.id);

        const lastSeenDate = presence?.last_seen ? new Date(presence.last_seen) : null;
        const isOnline = lastSeenDate ? (new Date().getTime() - lastSeenDate.getTime()) < 60000 : false;

        convs.push({
          id: match.id,
          otherUser: {
            id: otherUserId,
            first_name: profile?.first_name || 'Utilisateur',
            photos: profile?.photos || [],
            last_seen: presence?.last_seen
          },
          lastMessage: lastMessages?.[0],
          unreadCount: unreadCount || 0,
          isOnline
        });
      }

      // Trier par date du dernier message
      convs.sort((a, b) => {
        const timeA = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
        const timeB = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
        return timeB - timeA;
      });

      setConversations(convs);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Recharger au focus
  useFocusEffect(
    useCallback(() => {
      fetchConversations();
    }, [fetchConversations])
  );

  // Polling Présence toutes les 30s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

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
          source={{ uri: item.otherUser.photos?.[0] || 'https://via.placeholder.com/150' }} 
          style={styles.avatar} 
        />
        {item.isOnline && <View style={styles.onlineDot} />}
      </View>
      
      <View style={styles.chatInfo}>
        <View style={styles.chatHeader}>
          <Text style={[styles.name, { color: themeColors.text }]}>{item.otherUser.first_name}</Text>
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
      ) : conversations.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>
            Pas encore de match 💔{"\n"}Continuez à swiper !
          </Text>
        </View>
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
  emptyText: { fontSize: 18, textAlign: 'center', lineHeight: 28 },
});
