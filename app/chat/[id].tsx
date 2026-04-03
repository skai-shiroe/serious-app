import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  KeyboardAvoidingView, 
  Platform, 
  useColorScheme,
  ActivityIndicator,
  Keyboard 
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Send, Check, CheckCheck } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { supabase } from '@/lib/supabase';

// Helper pour le temps relatif simplifié
const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  read: boolean;
  created_at: string;
}

export default function ChatScreen() {
  const { id: matchId } = useLocalSearchParams(); // match_id
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [partner, setPartner] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [isPartnerOnline, setIsPartnerOnline] = useState(false);
  
  const flatListRef = useRef<FlatList>(null);

  const themeColors = {
    text: isDark ? '#ffffff' : '#111827',
    textMuted: isDark ? '#9ca3af' : '#6b7280',
    bg: isDark ? '#111827' : '#f9fafb',
    headerBg: isDark ? '#1f2937' : '#ffffff',
    border: isDark ? '#374151' : '#e5e7eb',
    inputBg: isDark ? '#374151' : '#ffffff',
    bubbleThem: isDark ? '#374151' : '#f3f4f6',
  };

  // Initialisation
  useEffect(() => {
    const initChat = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setCurrentUser(user);

        // 1. Récupérer les détails du match pour trouver le partenaire
        const { data: match } = await supabase
          .from('matches')
          .select('*')
          .eq('id', matchId)
          .single();

        if (match) {
          const partnerId = match.user_id_1 === user.id ? match.user_id_2 : match.user_id_1;
          
          // 2. Récupérer le profil du partenaire
          const { data: profile } = await supabase
            .from('profiles')
            .select('user_id, first_name, photos')
            .eq('user_id', partnerId)
            .single();
          
          setPartner(profile);

          // 3. Charger l''historique
          const { data: history } = await supabase
            .from('messages')
            .select('*')
            .eq('match_id', matchId)
            .order('created_at', { ascending: true });
          
          setMessages(history || []);

          // 4. Marquer comme lu
          await supabase
            .from('messages')
            .update({ read: true })
            .eq('match_id', matchId)
            .neq('sender_id', user.id)
            .eq('read', false);
        }
      } catch (err) {
        console.error('Error initializing chat:', err);
      } finally {
        setLoading(false);
      }
    };

    initChat();

    // 5. Realtime Subscription
    const channel = supabase
      .channel(`chat:${matchId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages',
        filter: `match_id=eq.${matchId}` 
      }, (payload) => {
        const newMessage = payload.new as Message;
        setMessages(prev => [...prev, newMessage]);
        
        // Marquer comme lu si on est dans le chat
        if (newMessage.sender_id !== currentUser?.id) {
          supabase
            .from('messages')
            .update({ read: true })
            .eq('id', newMessage.id)
            .then();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, currentUser?.id]);

  // Polling Présence & Mise à jour de soi
  useEffect(() => {
    const updatePresence = async () => {
      if (!currentUser) return;
      await supabase.from('presence').upsert({ user_id: currentUser.id, last_seen: new Date().toISOString() });
    };

    const checkPartnerPresence = async () => {
      if (!partner) return;
      const { data } = await supabase
        .from('presence')
        .select('last_seen')
        .eq('user_id', partner.user_id)
        .maybeSingle();
      
      if (data?.last_seen) {
        const lastSeen = new Date(data.last_seen);
        setIsPartnerOnline((new Date().getTime() - lastSeen.getTime()) < 60000);
      }
    };

    updatePresence();
    checkPartnerPresence();

    const interval = setInterval(() => {
      updatePresence();
      checkPartnerPresence();
    }, 30000);

    return () => clearInterval(interval);
  }, [currentUser, partner]);

  const handleSend = async () => {
    if (!inputText.trim() || !currentUser || !matchId) return;

    const text = inputText.trim();
    setInputText('');
    Keyboard.dismiss();

    try {
      await supabase.from('messages').insert({
        match_id: matchId,
        sender_id: currentUser.id,
        content: text,
      });
      // Le Realtime s''occupera de l''ajouter à la liste
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const renderBubble = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === currentUser?.id;
    return (
      <View style={[styles.messageWrapper, isMe ? styles.messageWrapperMe : styles.messageWrapperThem]}>
        <View style={[
          styles.bubble, 
          isMe ? styles.bubbleMe : [styles.bubbleThem, { backgroundColor: themeColors.bubbleThem }]
        ]}>
          <Text style={[styles.messageText, isMe ? styles.messageTextMe : { color: themeColors.text }]}>
            {item.content}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={[styles.timeText, { color: themeColors.textMuted }]}>{formatTime(item.created_at)}</Text>
          {isMe && (
            item.read ? <CheckCheck size={14} color="#3b82f6" /> : <Check size={14} color={themeColors.textMuted} />
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: themeColors.bg }]}>
        <ActivityIndicator size="large" color="#f43f5e" />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.bg }]}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        
        {/* Header */}
        <View style={[styles.header, { backgroundColor: themeColors.headerBg, borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft color={themeColors.text} size={24} />
          </TouchableOpacity>
          
          <View style={styles.headerInfo}>
            <Image 
              source={{ uri: partner?.photos?.[0] || 'https://via.placeholder.com/150' }} 
              style={styles.headerAvatar} 
            />
            <View>
              <Text style={[styles.headerTitle, { color: themeColors.text }]}>{partner?.first_name || 'Chat'}</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: isPartnerOnline ? '#10b981' : '#9ca3af' }]} />
                <Text style={[styles.statusText, { color: themeColors.textMuted }]}>
                  {isPartnerOnline ? 'En ligne' : 'Hors ligne'}
                </Text>
              </View>
            </View>
          </View>
          
          <View style={{ width: 40 }} />
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderBubble}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        {/* Input */}
        <View style={[styles.inputContainer, { backgroundColor: themeColors.headerBg, borderTopColor: themeColors.border, paddingBottom: Platform.OS === 'ios' ? 24 : 16 }]}>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.inputBg, color: themeColors.text, borderColor: themeColors.border }]}
            placeholder="Écrire un message..."
            placeholderTextColor={themeColors.textMuted}
            value={inputText}
            onChangeText={setInputText}
            multiline
          />
          <TouchableOpacity onPress={handleSend} style={styles.sendBtn} disabled={!inputText.trim()}>
            <LinearGradient
              colors={['#f43f5e', '#ec4899']}
              style={styles.sendGradient}
            >
              <Send color="#ffffff" size={20} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    padding: 16, 
    borderBottomWidth: 1,
    zIndex: 10
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20 },
  headerTitle: { fontSize: 17, fontWeight: 'bold' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12 },
  messagesList: { padding: 16, paddingBottom: 24 },
  messageWrapper: { marginBottom: 12, maxWidth: '80%' },
  messageWrapperMe: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  messageWrapperThem: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 18 },
  bubbleMe: { backgroundColor: '#f43f5e', borderBottomRightRadius: 2 },
  bubbleThem: { borderBottomLeftRadius: 2 },
  messageText: { fontSize: 16, lineHeight: 22 },
  messageTextMe: { color: '#ffffff' },
  timeText: { fontSize: 11, marginTop: 4, marginHorizontal: 4 },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, borderTopWidth: 1 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, fontSize: 16, marginRight: 10 },
  sendBtn: { width: 44, height: 44, marginBottom: 0 },
  sendGradient: { width: '100%', height: '100%', borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
});
