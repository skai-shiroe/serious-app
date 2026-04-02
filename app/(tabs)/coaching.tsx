import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, useColorScheme, TouchableOpacity, ActivityIndicator, RefreshControl, Platform, Modal, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { Image } from 'expo-image';
import { supabase } from '@/lib/supabase';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart, Activity, Sparkles, Clock, ChevronRight, Plus, X, Camera, Image as ImageIcon } from 'lucide-react-native';

interface CoachingPost {
  id: string;
  title: string;
  content: string;
  category: 'couple' | 'santé' | 'astuce';
  image_url: string;
  created_at: string;
  likes_count: number;
}

const CATEGORIES = [
  { id: 'all', label: 'Tous', icon: Sparkles },
  { id: 'couple', label: 'Couple', icon: Heart },
  { id: 'santé', label: 'Santé', icon: Activity },
];

export default function CoachingScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [posts, setPosts] = useState<CoachingPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newPost, setNewPost] = useState({ 
    title: '', 
    content: '', 
    category: 'couple' as 'couple' | 'santé' | 'astuce',
    image_url: '' 
  });
  const [submitting, setSubmitting] = useState(false);

  const themeColors = {
    text: isDark ? '#ffffff' : '#111827',
    textMuted: isDark ? '#9ca3af' : '#6b7280',
    bg: isDark ? '#111827' : '#f9fafb',
    card: isDark ? '#1f2937' : '#ffffff',
    border: isDark ? '#374151' : '#f3f4f6',
    accent: '#f43f5e',
  };

  const fetchPosts = async () => {
    try {
      let query = supabase
        .from('coaching_posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (activeCategory !== 'all') {
        query = query.eq('category', activeCategory);
      }

      const { data, error } = await query;

      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.error('Error fetching coaching posts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setUserRole(null);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setUserRole(data.role);
    } catch (error) {
      console.error('Error fetching user role:', error);
    } finally {
      setRoleLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
    fetchUserRole();
  }, [activeCategory]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPosts();
    fetchUserRole();
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setNewPost(prev => ({ ...prev, image_url: `data:image/jpeg;base64,${result.assets[0].base64}` }));
    }
  };

  const handleSubmit = async () => {
    if (!newPost.title || !newPost.content) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }

    setSubmitting(true);
    try {
      let finalImageUrl = 'https://images.unsplash.com/photo-1518717758536-85ae29035b6d?w=500&auto=format&fit=crop&q=60';
      
      if (newPost.image_url) {
        if (newPost.image_url.startsWith('http')) {
          finalImageUrl = newPost.image_url;
        } else if (newPost.image_url.startsWith('data:image')) {
          // Upload to Supabase Storage
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error("Utilisateur non connecté");

          const filePath = `${user.id}/${Date.now()}.jpg`;
          const base64Str = newPost.image_url.replace(/^data:image\/\w+;base64,/, '');

          // Utilisation du nouveau bucket 'coaching'
          const { error: uploadError } = await supabase.storage
            .from('coaching')
            .upload(filePath, decode(base64Str), {
              contentType: 'image/jpeg',
              upsert: true
            });

          if (uploadError) throw uploadError;

          const { data } = supabase.storage
            .from('coaching')
            .getPublicUrl(filePath);

          finalImageUrl = data.publicUrl;
        }
      }

      const { error } = await supabase
        .from('coaching_posts')
        .insert([{
          title: newPost.title,
          content: newPost.content,
          category: newPost.category,
          image_url: finalImageUrl
        }]);

      if (error) {
        console.error('Erreur insertion Supabase:', error);
        throw new Error(error.message);
      }

      Alert.alert('Succès', 'Votre conseil a été ajouté avec succès !');
      setIsModalVisible(false);
      setNewPost({ title: '', content: '', category: 'couple', image_url: '' });
      fetchPosts();
    } catch (error: any) {
      console.error('Erreur complète:', error);
      const errorMessage = error.message || 'Impossible d\'ajouter le conseil';
      Alert.alert('Erreur', `Détails : ${errorMessage}`);
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 24) {
      return `Il y a ${diffInHours}h`;
    } else {
      return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }
  };

  const getCategoryTheme = (category: string) => {
    switch (category) {
      case 'couple': return { colors: ['#f43f5e', '#ec4899'] as const, label: 'Couple' };
      case 'santé': return { colors: ['#10b981', '#3b82f6'] as const, label: 'Santé' };
      default: return { colors: ['#8b5cf6', '#6366f1'] as const, label: 'Astuce' };
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.bg }]}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={themeColors.accent} />
        }
      >
        
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: themeColors.text }]}>Conseils Coaching</Text>
              <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>
                Votre fil d'actualités pour une vie épanouie
              </Text>
            </View>
            {!roleLoading && (userRole === 'admin' || userRole === 'manager') && (
              <TouchableOpacity 
                style={styles.addButton} 
                onPress={() => setIsModalVisible(true)}
                activeOpacity={0.8}
              >
                <Plus size={24} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Categories Chips */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.categoriesContainer}
          contentContainerStyle={styles.categoriesContent}
        >
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = activeCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                onPress={() => {
                  setLoading(true);
                  setActiveCategory(cat.id);
                }}
                style={[
                  styles.categoryChip,
                  { backgroundColor: isSelected ? themeColors.accent : themeColors.card, borderColor: themeColors.border }
                ]}
              >
                <Icon size={16} color={isSelected ? '#fff' : themeColors.accent} />
                <Text style={[styles.categoryLabel, { color: isSelected ? '#fff' : themeColors.text }]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={themeColors.accent} />
          </View>
        ) : posts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>
              Aucun conseil disponible pour le moment.
            </Text>
          </View>
        ) : (
          posts.map((post) => {
            const theme = getCategoryTheme(post.category);
            return (
              <TouchableOpacity 
                key={post.id} 
                style={[styles.postCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                activeOpacity={0.9}
                onPress={() => router.push({ pathname: '/coaching/[id]', params: { id: post.id } })}
              >
                {post.image_url && (
                  <Image 
                    source={{ uri: post.image_url }} 
                    style={styles.postImage}
                    contentFit="cover"
                    transition={300}
                  />
                )}
                <View style={styles.postContent}>
                  <View style={styles.postHeader}>
                    <LinearGradient colors={theme.colors} style={styles.categoryBadge}>
                      <Text style={styles.categoryBadgeText}>{theme.label}</Text>
                    </LinearGradient>
                    <View style={styles.timeContainer}>
                      <Clock size={12} color={themeColors.textMuted} />
                      <Text style={[styles.timeText, { color: themeColors.textMuted }]}>
                        {formatTime(post.created_at)}
                      </Text>
                    </View>
                  </View>
                  
                  <Text style={[styles.postTitle, { color: themeColors.text }]}>{post.title}</Text>
                  <Text style={[styles.postExcerpt, { color: themeColors.textMuted }]} numberOfLines={2}>
                    {post.content}
                  </Text>
                  
                  <View style={styles.postFooter}>
                    <Text style={[styles.readMore, { color: themeColors.accent }]}>Lire la suite</Text>
                    <ChevronRight size={16} color={themeColors.accent} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}

      </ScrollView>

      {/* Modal d'ajout de conseil */}
      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Ajouter un conseil</Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                <X size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: themeColors.text }]}>Titre</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.bg, color: themeColors.text, borderColor: themeColors.border }]}
                  placeholder="Le titre du conseil"
                  placeholderTextColor={themeColors.textMuted}
                  value={newPost.title}
                  onChangeText={(text) => setNewPost({ ...newPost, title: text })}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: themeColors.text }]}>Catégorie</Text>
                <View style={[styles.pickerContainer, { backgroundColor: themeColors.bg, borderColor: themeColors.border }]}>
                  <Picker
                    selectedValue={newPost.category}
                    onValueChange={(itemValue) => setNewPost({ ...newPost, category: itemValue as any })}
                    style={{ color: themeColors.text }}
                    dropdownIconColor={themeColors.text}
                  >
                    <Picker.Item label="Couple" value="couple" />
                    <Picker.Item label="Santé" value="santé" />
                    <Picker.Item label="Astuce" value="astuce" />
                  </Picker>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: themeColors.text }]}>Image de couverture</Text>
                <View style={styles.imagePickerRow}>
                  <TouchableOpacity 
                    style={[styles.imagePickerBtn, { backgroundColor: themeColors.bg, borderColor: themeColors.border }]}
                    onPress={handlePickImage}
                  >
                    {newPost.image_url && newPost.image_url.startsWith('data') ? (
                      <Image source={{ uri: newPost.image_url }} style={styles.imagePreview} />
                    ) : (
                      <>
                        <Camera color={themeColors.textMuted} size={24} />
                        <Text style={[styles.imagePickerText, { color: themeColors.textMuted }]}>Choisir une image</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  
                  <View style={{ flex: 1, gap: 8 }}>
                    <Text style={[styles.smallLabel, { color: themeColors.textMuted }]}>Ou collez un lien URL :</Text>
                    <TextInput
                      style={[styles.smallInput, { backgroundColor: themeColors.bg, color: themeColors.text, borderColor: themeColors.border }]}
                      placeholder="https://..."
                      placeholderTextColor={themeColors.textMuted}
                      value={newPost.image_url?.startsWith('http') ? newPost.image_url : ''}
                      onChangeText={(text) => setNewPost({ ...newPost, image_url: text })}
                    />
                  </View>
                </View>
                {newPost.image_url && newPost.image_url.startsWith('http') && (
                  <View style={styles.urlPreviewContainer}>
                    <Image source={{ uri: newPost.image_url }} style={styles.imagePreview} />
                  </View>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: themeColors.text }]}>Contenu</Text>
                <TextInput
                  style={[styles.input, styles.textArea, { backgroundColor: themeColors.bg, color: themeColors.text, borderColor: themeColors.border }]}
                  placeholder="Écrivez votre conseil ici..."
                  placeholderTextColor={themeColors.textMuted}
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                  value={newPost.content}
                  onChangeText={(text) => setNewPost({ ...newPost, content: text })}
                />
              </View>

              <TouchableOpacity 
                style={styles.submitButton} 
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Publier le conseil</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  header: { padding: 24, paddingBottom: 0, marginBottom: 24 },
  title: { fontSize: 32, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 16, lineHeight: 22 },
  
  categoriesContainer: { paddingLeft: 24, marginBottom: 24 },
  categoriesContent: { paddingRight: 40, gap: 12, flexDirection: 'row' },
  categoryChip: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    borderRadius: 20, 
    borderWidth: 1,
    gap: 8,
  },
  categoryLabel: { fontSize: 14, fontWeight: '600' },

  loaderContainer: { marginTop: 100, alignItems: 'center' },
  emptyContainer: { marginTop: 100, paddingHorizontal: 48, alignItems: 'center' },
  emptyText: { textAlign: 'center', fontSize: 16 },

  postCard: {
    marginHorizontal: 24,
    marginBottom: 20,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  postImage: { width: '100%', height: 180 },
  postContent: { padding: 20 },
  postHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  categoryBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  categoryBadgeText: { color: '#ffffff', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' },
  timeContainer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeText: { fontSize: 12 },
  postTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  postExcerpt: { fontSize: 15, lineHeight: 22, marginBottom: 16 },
  postFooter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  readMore: { fontSize: 14, fontWeight: 'bold' },

  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addButton: { 
    width: 48, 
    height: 48, 
    borderRadius: 24, 
    backgroundColor: '#f43f5e', 
    justifyContent: 'center', 
    alignItems: 'center',
    shadowColor: '#f43f5e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },

  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'flex-end' 
  },
  modalContent: { 
    borderTopLeftRadius: 32, 
    borderTopRightRadius: 32, 
    padding: 24, 
    maxHeight: '90%' 
  },
  modalHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 24 
  },
  modalTitle: { fontSize: 24, fontWeight: 'bold' },
  formGroup: { marginBottom: 20 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  input: { 
    borderRadius: 12, 
    padding: 16, 
    fontSize: 16, 
    borderWidth: 1,
  },
  textArea: { height: 150 },
  pickerContainer: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  submitButton: { 
    backgroundColor: '#f43f5e', 
    borderRadius: 16, 
    paddingVertical: 16, 
    alignItems: 'center', 
    marginTop: 8,
    marginBottom: 20
  },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  imagePickerRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  imagePickerBtn: { 
    width: 100, 
    height: 100, 
    borderRadius: 12, 
    borderWidth: 1, 
    borderStyle: 'dashed', 
    justifyContent: 'center', 
    alignItems: 'center',
    overflow: 'hidden'
  },
  imagePickerText: { fontSize: 10, marginTop: 4, textAlign: 'center' },
  imagePreview: { width: '100%', height: '100%' },
  smallLabel: { fontSize: 12, fontWeight: '500' },
  smallInput: { 
    borderRadius: 8, 
    padding: 10, 
    fontSize: 14, 
    borderWidth: 1,
  },
  urlPreviewContainer: { marginTop: 12, width: '100%', height: 150, borderRadius: 12, overflow: 'hidden' },
});
