import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';

const MOCK_CONVERSATIONS = [
  { id: '1', name: 'Sophie', lastMessage: 'Salut ! Ça va ?', time: '14:32', avatar: 'https://via.placeholder.com/150/FFB6C1/000000?text=S', unread: 2 },
  { id: '2', name: 'Laura', lastMessage: 'On se voit ce week-end ?', time: 'Hier', avatar: 'https://via.placeholder.com/150/ADD8E6/000000?text=L', unread: 0 },
  { id: '3', name: 'Camille', lastMessage: '😂', time: 'Lun', avatar: 'https://via.placeholder.com/150/FFE4B5/000000?text=C', unread: 0 },
  { id: '4', name: 'Emma', lastMessage: 'Merci pour le conseil !', time: 'Dim', avatar: 'https://via.placeholder.com/150/98FB98/000000?text=E', unread: 0 },
];

export default function MessagesScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const themeColors = {
    text: isDark ? '#ffffff' : '#111827',
    textMuted: isDark ? '#9ca3af' : '#6b7280',
    bg: isDark ? '#111827' : '#ffffff',
    border: isDark ? '#374151' : '#f3f4f6',
    card: isDark ? '#1f2937' : '#ffffff',
  };

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={[styles.chatItem, { borderBottomColor: themeColors.border }]}
      onPress={() => router.push(`/chat/${item.id}` as any)}
      activeOpacity={0.7}
    >
      <Image source={{ uri: item.avatar }} style={styles.avatar} />
      <View style={styles.chatInfo}>
        <View style={styles.chatHeader}>
          <Text style={[styles.name, { color: themeColors.text }]}>{item.name}</Text>
          <Text style={[styles.time, { color: item.unread > 0 ? '#f43f5e' : themeColors.textMuted }]}>{item.time}</Text>
        </View>
        <View style={styles.chatFooter}>
          <Text style={[styles.lastMessage, { color: item.unread > 0 ? themeColors.text : themeColors.textMuted, fontWeight: item.unread > 0 ? '600' : '400' }]} numberOfLines={1}>
            {item.lastMessage}
          </Text>
          {item.unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.unread}</Text>
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
      <FlatList
        data={MOCK_CONVERSATIONS}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { padding: 24, paddingTop: 16, paddingBottom: 16 },
  title: { fontSize: 32, fontWeight: 'bold' },
  listContent: { paddingHorizontal: 24, paddingBottom: 24 },
  chatItem: { flexDirection: 'row', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 60, height: 60, borderRadius: 30, marginRight: 16, backgroundColor: '#f3f4f6' },
  chatInfo: { flex: 1, justifyContent: 'center' },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  name: { fontSize: 17, fontWeight: '600' },
  time: { fontSize: 13 },
  chatFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lastMessage: { flex: 1, fontSize: 15, paddingRight: 16 },
  badge: { backgroundColor: '#f43f5e', minWidth: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#ffffff', fontSize: 12, fontWeight: 'bold' },
});
