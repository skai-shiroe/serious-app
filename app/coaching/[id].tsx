import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions, Platform, Share, TextInput, KeyboardAvoidingView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Share2, Heart, Clock, Bookmark, Sparkles, Send, MessageCircle, User } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useColorScheme } from 'react-native';

const { width } = Dimensions.get('window');

interface CoachingPost {
  id: string;
  title: string;
  content: string;
  category: 'couple' | 'santé' | 'astuce';
  image_url: string;
  created_at: string;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles: {
    user_id: string;
    photos: string[];
    role: string;
    first_name: string;
    last_name: string;
  };
}

export default function CoachingDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
  const [post, setPost] = useState<CoachingPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  const themeColors = {
    bg: isDark ? '#111827' : '#ffffff',
    text: isDark ? '#ffffff' : '#111827',
    textMuted: isDark ? '#9ca3af' : '#6b7280',
    card: isDark ? '#1f2937' : '#f9fafb',
    accent: '#f43f5e',
    glass: isDark ? 'rgba(31, 41, 55, 0.7)' : 'rgba(255, 255, 255, 0.7)',
    input: isDark ? '#374151' : '#f3f4f6',
  };

  useEffect(() => {
    fetchPost();
    fetchInteractions();
    fetchComments();
  }, [id]);

  const fetchPost = async () => {
    try {
      const { data, error } = await supabase
        .from('coaching_posts')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setPost(data);
    } catch (error) {
      console.error('Error fetching post:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchInteractions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if liked
      const { count: likeCount, data: likedData } = await supabase
        .from('coaching_likes')
        .select('id', { count: 'exact' })
        .eq('post_id', id)
        .eq('user_id', user.id);
      
      setIsLiked(likedData ? likedData.length > 0 : false);

      // Get total likes count
      const { count: totalLikes } = await supabase
        .from('coaching_likes')
        .select('id', { count: 'exact' })
        .eq('post_id', id);
      
      setLikesCount(totalLikes || 0);

      // Check if favorite
      const { data: favData } = await supabase
        .from('coaching_favorites')
        .select('id')
        .eq('post_id', id)
        .eq('user_id', user.id);
      
      setIsFavorite(favData ? favData.length > 0 : false);
    } catch (error) {
      console.error('Error fetching interactions:', error);
    }
  };

  const fetchComments = async () => {
    try {
      const { data, error } = await supabase
        .from('coaching_comments')
        .select(`
          *,
          profiles:user_id (
            user_id,
            photos,
            role,
            first_name,
            last_name
          )
        `)
        .eq('post_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setComments(data || []);
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };

  const toggleLike = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Connexion requise', 'Connectez-vous pour liker ce conseil.');
        return;
      }

      if (isLiked) {
        await supabase
          .from('coaching_likes')
          .delete()
          .eq('post_id', id)
          .eq('user_id', user.id);
        setLikesCount(prev => prev - 1);
      } else {
        await supabase
          .from('coaching_likes')
          .insert({ post_id: id, user_id: user.id });
        setLikesCount(prev => prev + 1);
      }
      setIsLiked(!isLiked);
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const toggleFavorite = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Connexion requise', 'Connectez-vous pour enregistrer ce conseil.');
        return;
      }

      if (isFavorite) {
        await supabase
          .from('coaching_favorites')
          .delete()
          .eq('post_id', id)
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('coaching_favorites')
          .insert({ post_id: id, user_id: user.id });
      }
      setIsFavorite(!isFavorite);
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    try {
      setCommentLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Connexion requise', 'Connectez-vous pour commenter.');
        return;
      }

      const { error } = await supabase
        .from('coaching_comments')
        .insert({
          post_id: id,
          user_id: user.id,
          content: newComment.trim()
        });

      if (error) throw error;
      
      setNewComment('');
      fetchComments();
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    } finally {
      setCommentLoading(false);
    }
  };

  const handleShare = async () => {
    if (!post) return;
    try {
      await Share.share({
        message: `${post.title}\n\n${post.content}\n\nDécouvrez plus de conseils sur Serious App !`,
      });
    } catch (error) {
      console.error(error);
    }
  };

  const getCategoryTheme = (category: string) => {
    switch (category) {
      case 'couple': return { colors: ['#f43f5e', '#ec4899'] as const, label: 'Couple' };
      case 'santé': return { colors: ['#10b981', '#3b82f6'] as const, label: 'Santé' };
      default: return { colors: ['#8b5cf6', '#6366f1'] as const, label: 'Astuce' };
    }
  };

  if (loading) {
    return (
      <View style={[styles.loaderContainer, { backgroundColor: themeColors.bg }]}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[styles.loaderContainer, { backgroundColor: themeColors.bg }]}>
        <Text style={{ color: themeColors.text }}>Conseil non trouvé.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={{ color: themeColors.accent }}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const catTheme = getCategoryTheme(post.category);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Hero Image Section */}
        <View style={styles.heroContainer}>
          <Image 
            source={{ uri: post.image_url }} 
            style={styles.heroImage}
            contentFit="cover"
            transition={500}
          />
          <LinearGradient 
            colors={['rgba(0,0,0,0.4)', 'transparent', 'rgba(0,0,0,0.8)']} 
            style={styles.heroOverlay} 
          />
          
          <SafeAreaView style={styles.headerButtons}>
            <TouchableOpacity 
              onPress={() => router.back()} 
              style={[styles.glassBtn, { backgroundColor: themeColors.glass }]}
            >
              <ChevronLeft size={24} color={isDark ? '#fff' : '#000'} />
            </TouchableOpacity>
            
            <View style={styles.headerRight}>
              <TouchableOpacity 
                onPress={handleShare}
                style={[styles.glassBtn, { backgroundColor: themeColors.glass }]}
              >
                <Share2 size={22} color={isDark ? '#fff' : '#000'} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.glassBtn, { backgroundColor: themeColors.glass }]}
                onPress={toggleLike}
              >
                <Heart size={22} color={isLiked ? themeColors.accent : (isDark ? '#fff' : '#000')} fill={isLiked ? themeColors.accent : 'transparent'} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.glassBtn, { backgroundColor: themeColors.glass }]}
                onPress={toggleFavorite}
              >
                <Bookmark size={22} color={isFavorite ? themeColors.accent : (isDark ? '#fff' : '#000')} fill={isFavorite ? themeColors.accent : 'transparent'} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>

          <View style={styles.heroTextContainer}>
            <Animated.View entering={FadeInDown.delay(200).duration(800)}>
              <LinearGradient colors={catTheme.colors} style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{catTheme.label}</Text>
              </LinearGradient>
              <Text style={styles.title}>{post.title}</Text>
            </Animated.View>
          </View>
        </View>

        {/* Content Section */}
        <Animated.View 
          entering={FadeInDown.delay(400).duration(800)} 
          style={[styles.contentCard, { backgroundColor: themeColors.bg }]}
        >
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Clock size={16} color={themeColors.textMuted} />
              <Text style={[styles.metaText, { color: themeColors.textMuted }]}>
                {new Date(post.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Sparkles size={16} color={themeColors.accent} />
              <Text style={[styles.metaText, { color: themeColors.accent }]}>Exclusif</Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: isDark ? '#374151' : '#f3f4f6' }]} />

          <Text style={[styles.bodyContent, { color: themeColors.text }]}>
            {post.content}
          </Text>

          <View style={[styles.footerCard, { backgroundColor: themeColors.card }]}>
            <View style={styles.statsIndicator}>
              <View style={styles.statIconContainer}>
                <Heart size={20} color={themeColors.accent} fill={isLiked ? themeColors.accent : 'transparent'} />
                <Text style={[styles.statValue, { color: themeColors.text }]}>{likesCount}</Text>
              </View>
              <View style={styles.statIconContainer}>
                <MessageCircle size={20} color={themeColors.textMuted} />
                <Text style={[styles.statValue, { color: themeColors.text }]}>{comments.length}</Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.footerTitle, { color: themeColors.text }]}>Interaction sociale</Text>
              <Text style={[styles.footerSub, { color: themeColors.textMuted }]}>Participez à la discussion et montrez votre intérêt.</Text>
            </View>
          </View>

          {/* New Comments Section */}
          <View style={styles.commentsSection}>
            <Text style={[styles.sectionTitleContent, { color: themeColors.text }]}>Commentaires ({comments.length})</Text>
            
            <View style={styles.addCommentContainer}>
              <TextInput
                style={[styles.commentInput, { backgroundColor: themeColors.input, color: themeColors.text }]}
                placeholder="Ajouter un commentaire..."
                placeholderTextColor={themeColors.textMuted}
                value={newComment}
                onChangeText={setNewComment}
                multiline
              />
              <TouchableOpacity 
                style={[styles.sendBtn, { backgroundColor: themeColors.accent }]}
                onPress={handleAddComment}
                disabled={commentLoading}
              >
                {commentLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Send size={20} color="#fff" />
                )}
              </TouchableOpacity>
            </View>

            {comments.length === 0 ? (
              <View style={styles.noComments}>
                <Text style={[styles.noCommentsText, { color: themeColors.textMuted }]}>Soyez le premier à commenter !</Text>
              </View>
            ) : (
              comments.map((comment) => (
                <View key={comment.id} style={styles.commentItem}>
                  {comment.profiles?.photos?.[0] ? (
                    <Image source={{ uri: comment.profiles.photos[0] }} style={styles.commentAvatar} />
                  ) : (
                    <View style={[styles.commentAvatar, { backgroundColor: themeColors.input, justifyContent: 'center', alignItems: 'center' }]}>
                      <User size={16} color={themeColors.textMuted} />
                    </View>
                  )}
                  <View style={[styles.commentContent, { backgroundColor: themeColors.card }]}>
                    <View style={styles.commentHeader}>
                      <Text style={[styles.commentUser, { color: themeColors.text }]}>
                        {comment.profiles?.first_name || comment.profiles?.last_name 
                          ? `${comment.profiles.first_name || ''} ${comment.profiles.last_name || ''}`.trim()
                          : 'Utilisateur'}
                        {comment.profiles?.role === 'admin' ? ' (Admin)' : ''}
                      </Text>
                      <Text style={[styles.commentTime, { color: themeColors.textMuted }]}>
                        {new Date(comment.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={[styles.commentText, { color: themeColors.text }]}>{comment.content}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
          
          <View style={{ height: 50 }} />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { flexGrow: 1 },
  
  heroContainer: { 
    height: 450, 
    width: '100%', 
    position: 'relative' 
  },
  heroImage: { 
    width: '100%', 
    height: '100%' 
  },
  heroOverlay: { 
    ...StyleSheet.absoluteFillObject 
  },
  
  headerButtons: { 
    position: 'absolute', 
    top: 0, 
    left: 20, 
    right: 20, 
    flexDirection: 'row', 
    justifyContent: 'space-between',
    zIndex: 10
  },
  headerRight: { 
    flexDirection: 'row', 
    gap: 12 
  },
  glassBtn: { 
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    justifyContent: 'center', 
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 4 },
    }),
  },
  
  heroTextContainer: { 
    position: 'absolute', 
    bottom: 40, 
    left: 24, 
    right: 24 
  },
  categoryBadge: { 
    alignSelf: 'flex-start', 
    paddingHorizontal: 16, 
    paddingVertical: 6, 
    borderRadius: 12, 
    marginBottom: 16 
  },
  categoryText: { 
    color: '#fff', 
    fontSize: 12, 
    fontWeight: 'bold', 
    textTransform: 'uppercase' 
  },
  title: { 
    fontSize: 32, 
    fontWeight: 'bold', 
    color: '#fff', 
    lineHeight: 40 
  },
  
  contentCard: { 
    marginTop: -30, 
    borderTopLeftRadius: 32, 
    borderTopRightRadius: 32, 
    padding: 32,
    flex: 1
  },
  metaRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 24 
  },
  metaItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8 
  },
  metaText: { 
    fontSize: 14, 
    fontWeight: '500' 
  },
  divider: { 
    height: 1, 
    width: '100%', 
    marginBottom: 24 
  },
  bodyContent: { 
    fontSize: 18, 
    lineHeight: 28, 
    marginBottom: 32,
    opacity: 0.9
  },
  
  footerCard: { 
    flexDirection: 'row', 
    padding: 20, 
    borderRadius: 24, 
    alignItems: 'center', 
    gap: 16 
  },
  footerTitle: { 
    fontSize: 16, 
    fontWeight: 'bold', 
    marginBottom: 4 
  },
  footerSub: { 
    fontSize: 13 
  },
  
  backBtn: { 
    marginTop: 20, 
    padding: 10 
  },
  statsIndicator: {
    gap: 12,
    marginRight: 8
  },
  statIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  statValue: {
    fontSize: 12,
    fontWeight: 'bold'
  },
  commentsSection: {
    marginTop: 40,
  },
  sectionTitleContent: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20
  },
  addCommentContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
    alignItems: 'flex-end'
  },
  commentInput: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    paddingTop: 12,
    fontSize: 15,
    maxHeight: 120
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center'
  },
  noComments: {
    paddingVertical: 40,
    alignItems: 'center'
  },
  noCommentsText: {
    fontSize: 15,
    fontStyle: 'italic'
  },
  commentItem: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20
  },
  commentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20
  },
  commentContent: {
    flex: 1,
    padding: 16,
    borderRadius: 20,
    borderTopLeftRadius: 4
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  commentUser: {
    fontSize: 14,
    fontWeight: 'bold'
  },
  commentTime: {
    fontSize: 11
  },
  commentText: {
    fontSize: 15,
    lineHeight: 22
  }
});
