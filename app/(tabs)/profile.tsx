import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, useColorScheme, TouchableOpacity, Alert, Switch, Appearance, Platform, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { IMAGE_CACHE_POLICY, imageSource } from '@/lib/images';
import { supabase } from '@/lib/supabase';
import { getUser } from '@/lib/session';
import { LinearGradient } from 'expo-linear-gradient';
import { LogOut, Edit3, MapPin, BookOpen, Briefcase, Droplet, Activity, Calendar, Moon, Sun, Camera, Bookmark, WifiOff, ShieldCheck, ChevronRight } from 'lucide-react-native';
import { EmptyState } from '@/components/empty-state';
import { CertifiedIcon, CertifiedPhotoBadge, isFullyVerified } from '@/components/verified-badge';
import PhotoViewer from '@/components/photo-viewer';
import { useRouter, useFocusEffect } from 'expo-router';

export default function ProfileScreen() {
  const { width: screenWidth } = Dimensions.get('window');
  const slotSize = (screenWidth - 48 - 8) / 4;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [savedPosts, setSavedPosts] = useState<any[]>([]);
  /** Index de la photo ouverte dans la visionneuse plein ecran, null = fermee. */
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // Distingue « section vide » de « chargement echoue »
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savedError, setSavedError] = useState<string | null>(null);
  // Derniere demande de verification par type : statut + decision non vue
  const [verifState, setVerifState] = useState<
    Record<string, { status: string; unseen: boolean }>
  >({});
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const themeColors = {
    text: isDark ? '#ffffff' : '#111827',
    textMuted: isDark ? '#9ca3af' : '#6b7280',
    bg: isDark ? '#111827' : '#f9fafb',
    bgCard: isDark ? '#1f2937' : '#ffffff',
    border: isDark ? '#374151' : '#f3f4f6',
    inputBg: isDark ? '#374151' : '#f3f4f6',
    icon: isDark ? '#9ca3af' : '#6b7280',
    accent: '#f43f5e',
  };

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

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
      fetchSavedPosts();
      fetchVerifications();
    }, [])
  );

  /**
   * Derniere demande de verification par type.
   * `unseen` = decision rendue mais jamais ouverte par l'utilisateur : c'est ce
   * qui alimente l'indicateur « Nouveau ». Cet etat vit en base (user_seen_at),
   * donc il survit a une reinstallation et suit l'utilisateur d'un appareil a
   * l'autre — contrairement a un drapeau stocke sur le telephone.
   */
  const fetchVerifications = async () => {
    try {
      const user = await getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('verifications')
        .select('type, status, reviewed_at, user_seen_at, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const latest: Record<string, { status: string; unseen: boolean }> = {};
      (data || []).forEach((row: any) => {
        if (latest[row.type]) return; // deja la plus recente
        latest[row.type] = {
          status: row.status,
          unseen: !!row.reviewed_at && !row.user_seen_at,
        };
      });
      setVerifState(latest);
    } catch (e) {
      // Indicateur purement informatif : un echec ne doit rien bloquer ici.
      console.log('Error fetching verifications', e);
    }
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setProfileError(null);
      const user = await getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('*, role, first_name, last_name')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      
      setProfile({
        ...data,
        age: calculateAge(data.birth_date),
        displayName: data.first_name || data.last_name 
          ? `${data.first_name || ''} ${data.last_name || ''}`.trim()
          : (user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Utilisateur'),
      });
    } catch (error: any) {
      console.log('Error fetching profile', error);
      setProfileError(
        'Impossible de charger votre profil. Vérifiez votre connexion puis réessayez.'
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchSavedPosts = async () => {
    try {
      setSavedError(null);
      const user = await getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('coaching_favorites')
        .select(`
          id,
          coaching_posts (*)
        `)
        .eq('user_id', user.id);

      if (error) throw error;
      
      // On filtre pour ne garder que les posts qui existent encore
      const posts = data?.map(f => f.coaching_posts).filter(p => p !== null) || [];
      setSavedPosts(posts);
    } catch (error) {
      console.log('Error fetching saved posts', error);
      setSavedError('Conseils enregistrés indisponibles.');
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de se déconnecter');
    }
  };

  const toggleTheme = async () => {
    const newTheme = isDark ? 'light' : 'dark';
    Appearance.setColorScheme(newTheme);
    
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('appTheme', newTheme);
      }
      return;
    }

    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem('appTheme', newTheme);
    } catch(e) {}
  };

  const calculateCompletion = () => {
    if (!profile) return 0;
    const fields = [
      profile.birth_date,
      profile.gender,
      profile.city,
      profile.religion,
      profile.profession,
      profile.interests && profile.interests.length > 0,
      profile.blood_type,
      profile.sickle_cell,
      profile.bio,
      profile.photos && profile.photos.length > 0
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  };

  if (loading && !profile) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: themeColors.bg }]}>
        <ActivityIndicator size="large" color="#f43f5e" />
      </View>
    );
  }

  // Echec de chargement : on n'affiche pas un profil vide et trompeur.
  if (!profile && profileError) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.bg }]}>
        <EmptyState
          isError
          icon={<WifiOff color={themeColors.textMuted} size={48} />}
          title="Chargement impossible"
          message={profileError}
          actionLabel="Réessayer"
          onAction={() => {
            fetchProfile();
            fetchSavedPosts();
          }}
        />
      </SafeAreaView>
    );
  }

  const completionPercent = calculateCompletion();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'manager';

  /** Libelle et couleur d'une verification, selon sa derniere demande. */
  const trustLabel = (type: 'identity' | 'genotype') => {
    const state = verifState[type];
    if (!state) return { text: 'À vérifier', color: themeColors.textMuted };

    switch (state.status) {
      case 'approved':
        return {
          text: type === 'identity' ? 'Vérifiée' : `Vérifié (${profile?.sickle_cell || '?'})`,
          color: '#10b981',
        };
      case 'pending':
        return { text: 'En relecture', color: '#f59e0b' };
      case 'rejected':
        return { text: 'Refusée', color: '#ef4444' };
      default:
        return { text: 'À vérifier', color: themeColors.textMuted };
    }
  };
  const mainPhoto = profile?.photos?.[0];
  // Photos exploitables (les trous du tableau sont ecartes) : c'est cette
  // meme liste que reçoit la visionneuse, d'ou l'indexOf pour l'index.
  const photos: string[] = (profile?.photos ?? []).filter(
    (p: any) => typeof p === 'string' && p.length > 0
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.bg }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        <View style={styles.header}>
          <Text style={[styles.title, { color: themeColors.text }]}>Mon Profil</Text>
        </View>

        <View style={styles.profileHeader}>
          <View style={{ marginBottom: 16 }}>
            <LinearGradient
              colors={['#f43f5e', '#ec4899']}
              style={[styles.avatarGradient, { marginBottom: 0 }]}
            >
              <TouchableOpacity
                activeOpacity={0.9}
                disabled={photos.length === 0}
                onPress={() => setViewerIndex(0)}
                style={{ width: '100%', height: '100%' }}
                accessibilityLabel="Voir la photo en grand"
              >
                <Image
                  source={imageSource(mainPhoto)}
                  style={styles.avatarLarge}
                  cachePolicy={IMAGE_CACHE_POLICY}
                  transition={120}
                />
              </TouchableOpacity>
            </LinearGradient>
            {isFullyVerified(profile) && (
              <CertifiedPhotoBadge size={34} style={{ bottom: 0, right: 0 }} />
            )}
          </View>
          <Text style={[styles.name, { color: themeColors.text }]}>
            {profile?.displayName}
          </Text>
          <View style={[styles.completionBadge, { backgroundColor: 'rgba(244, 63, 94, 0.1)' }]}>
            <Text style={[styles.completionText, { color: '#f43f5e' }]}>{completionPercent}% complété</Text>
          </View>

        </View>

        {/* Section Stats (âge, sang, drépanocytaire) */}
        <View style={styles.statsRow}>
          <View style={[styles.statPill, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
            <Calendar size={16} color="#3b82f6" />
            <Text style={[styles.statText, { color: '#3b82f6' }]}>{profile?.age ? `${profile.age} ans` : '?'}</Text>
          </View>
          <View style={[styles.statPill, { backgroundColor: 'rgba(244, 63, 94, 0.1)' }]}>
            <Droplet size={16} color="#f43f5e" />
            <Text style={[styles.statText, { color: '#f43f5e' }]}>{profile?.blood_type || '?'}</Text>
          </View>
          <View style={[styles.statPill, { backgroundColor: 'rgba(168, 85, 247, 0.1)' }]}>
            <Activity size={16} color="#a855f7" />
            <Text style={[styles.statText, { color: '#a855f7' }]}>{profile?.sickle_cell || '?'}</Text>
          </View>
        </View>

        {/* Confiance : identité + génotype */}
        <View style={[styles.card, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <View style={styles.sectionHeader}>
            <ShieldCheck size={20} color={themeColors.accent} />
            <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 0 }]}>Confiance</Text>
            {isFullyVerified(profile) && (
              <View style={{ marginLeft: 8 }}>
                <CertifiedIcon size={20} />
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.trustRow}
            onPress={() => router.push('/verification')}
            activeOpacity={0.8}
          >
            {(['identity', 'genotype'] as const).map((type) => {
              const label = trustLabel(type);
              return (
                <View key={type} style={{ flex: 1 }}>
                  <Text style={[styles.infoText, { color: themeColors.text }]}>
                    {type === 'identity' ? 'Identité' : 'Génotype'}
                  </Text>
                  <View style={styles.trustStatusRow}>
                    <Text style={[styles.trustStatus, { color: label.color }]}>{label.text}</Text>
                    {verifState[type]?.unseen && <Text style={styles.newPill}>Nouveau</Text>}
                  </View>
                </View>
              );
            })}
            <ChevronRight size={20} color={themeColors.icon} />
          </TouchableOpacity>

          {isAdmin && (
            <TouchableOpacity
              style={[styles.adminRow, { borderTopColor: themeColors.border }]}
              onPress={() => router.push('/admin/verifications')}
              activeOpacity={0.8}
            >
              <ShieldCheck size={18} color={themeColors.accent} />
              <Text style={[styles.infoText, { color: themeColors.text, flex: 1 }]}>
                Demandes à valider
              </Text>
              <ChevronRight size={18} color={themeColors.icon} />
            </TouchableOpacity>
          )}
        </View>

        {/* Informations */}
        <View style={[styles.card, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Informations</Text>
          
          <View style={styles.infoRow}>
            <BookOpen size={20} color={themeColors.icon} />
            <Text style={[styles.infoText, { color: themeColors.text }]}>
              {profile?.religion || 'Non renseigné'}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <Briefcase size={20} color={themeColors.icon} />
            <Text style={[styles.infoText, { color: themeColors.text }]}>
              {profile?.profession || 'Non renseigné'}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <MapPin size={20} color={themeColors.icon} />
            <Text style={[styles.infoText, { color: themeColors.text }]}>
              {profile?.city || 'Non renseigné'}
            </Text>
          </View>
        </View>

        {/* Bio */}
        <View style={[styles.card, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>À propos de moi</Text>
          <Text style={[styles.bioText, { color: themeColors.textMuted }]}>
            {profile?.bio || 'Aucune biographie renseignée.'}
          </Text>
        </View>

        {/* Interests */}
        <View style={[styles.card, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Mes centres d&apos;intérêt</Text>
          {profile?.interests?.length > 0 ? (
            <View style={styles.tagsContainer}>
              {profile.interests.map((tag: string, i: number) => (
                <View key={i} style={[styles.tagBadge, { backgroundColor: 'rgba(244, 63, 94, 0.1)' }]}>
                  <Text style={[styles.tagText, { color: '#f43f5e' }]}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ color: themeColors.textMuted }}>Aucun centre d&apos;intérêt renseigné</Text>
          )}
        </View>

        {/* Photos */}
        <View style={[styles.card, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Mes photos</Text>
          
          <View style={styles.gridContainer}>
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const uri = profile?.photos?.[i];
              return (
                <View key={i} style={[styles.slotWrapper, { width: slotSize, height: slotSize }]}>
                  {uri ? (
                    <TouchableOpacity
                      style={[styles.photoSlotFull, styles.shadow]}
                      activeOpacity={0.85}
                      onPress={() => {
                        const idx = photos.indexOf(uri);
                        if (idx >= 0) setViewerIndex(idx);
                      }}
                      accessibilityLabel={`Voir la photo ${i + 1} en grand`}
                    >
                      <Image
                        source={imageSource(uri)}
                        style={styles.fullImage}
                        contentFit="cover"
                        transition={150}
                        cachePolicy={IMAGE_CACHE_POLICY}
                        recyclingKey={`profile-photo-${i}`}
                      />
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.photoSlotFull, styles.emptySlot, { backgroundColor: themeColors.inputBg }]}>
                      <Camera color={themeColors.icon} size={28} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* Saved Posts Section */}
        <View style={[styles.card, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <View style={styles.sectionHeader}>
            <Bookmark size={20} color={themeColors.accent} />
            <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 0 }]}>Conseils Enregistrés</Text>
          </View>
          
          {savedPosts.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.savedPostsScroll}>
              {savedPosts.map((post) => (
                <TouchableOpacity 
                  key={post.id} 
                  style={[styles.savedPostCard, { backgroundColor: themeColors.bg }]}
                  onPress={() => router.push({ pathname: '/coaching/[id]', params: { id: post.id } })}
                >
                  <Image
                    source={imageSource(post.image_url)}
                    style={styles.savedPostImage}
                    cachePolicy={IMAGE_CACHE_POLICY}
                    recyclingKey={post.id}
                  />
                  <View style={styles.savedPostInfo}>
                    <Text style={[styles.savedPostTitle, { color: themeColors.text }]} numberOfLines={1}>{post.title}</Text>
                    <Text style={[styles.savedPostCategory, { color: themeColors.accent }]}>{post.category}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : savedError ? (
            <View style={styles.savedErrorRow}>
              <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>{savedError}</Text>
              <TouchableOpacity onPress={() => fetchSavedPosts()} activeOpacity={0.8}>
                <Text style={[styles.savedRetryText, { color: themeColors.accent }]}>Réessayer</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>Aucun conseil enregistré pour le moment.</Text>
          )}
        </View>

        {/* Préférences */}
        <View style={[styles.card, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Préférences</Text>
          <View style={styles.infoRow}>
            {isDark ? <Moon size={20} color={themeColors.icon} /> : <Sun size={20} color={themeColors.icon} />}
            <Text style={[styles.infoText, { color: themeColors.text, flex: 1 }]}>
              Mode Sombre
            </Text>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: '#d1d5db', true: '#f43f5e' }}
              thumbColor={'#ffffff'}
            />
          </View>
        </View>

        <TouchableOpacity style={styles.actionBtn} activeOpacity={0.8} onPress={() => router.push('/edit-profile')}>
          <LinearGradient
            colors={['#f43f5e', '#ec4899']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientBtn}
          >
            <Edit3 color="#ffffff" size={20} />
            <Text style={styles.btnText}>Modifier le profil</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.outlineBtn, { borderColor: themeColors.border }]} 
          activeOpacity={0.7}
          onPress={handleSignOut}
        >
          <LogOut color="#ef4444" size={20} />
          <Text style={[styles.outlineBtnText, { color: '#ef4444' }]}>Se déconnecter</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Visionneuse plein ecran des photos du profil */}
      <PhotoViewer
        visible={viewerIndex !== null}
        photos={photos}
        index={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 48 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { marginBottom: 24, marginTop: 8 },
  title: { fontSize: 32, fontWeight: 'bold' },
  profileHeader: { alignItems: 'center', marginBottom: 24 },
  avatarGradient: { width: 128, height: 128, borderRadius: 64, padding: 4, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  avatarLarge: { width: '100%', height: '100%', borderRadius: 60, backgroundColor: '#f3f4f6' },
  name: { fontSize: 28, fontWeight: 'bold', marginBottom: 8 },
  completionBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  completionText: { fontSize: 13, fontWeight: '700' },
  statsRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  statPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, gap: 8 },
  statText: { fontSize: 14, fontWeight: '600' },
  card: { borderRadius: 24, padding: 20, borderWidth: 1, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  infoText: { fontSize: 16 },
  bioText: { fontSize: 15, lineHeight: 22 },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  tagText: { fontSize: 14, fontWeight: '600' },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotWrapper: { marginBottom: 8 },
  photoSlotFull: { width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden' },
  fullImage: { width: '100%', height: '100%' },
  emptySlot: { justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(156, 163, 175, 0.3)' },
  shadow: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
  actionBtn: { marginTop: 8, marginBottom: 16, shadowColor: '#f43f5e', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  gradientBtn: { borderRadius: 28, paddingVertical: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  btnText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
  outlineBtn: { borderRadius: 28, paddingVertical: 16, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  outlineBtnText: { fontSize: 16, fontWeight: '600', marginLeft: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  savedPostsScroll: { marginTop: 8 },
  savedPostCard: { width: 160, borderRadius: 16, overflow: 'hidden', marginRight: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  savedPostImage: { width: '100%', height: 90 },
  savedPostInfo: { padding: 10 },
  savedPostTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  savedPostCategory: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  emptyText: { fontSize: 14, fontStyle: 'italic', marginTop: 8 },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trustStatus: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  trustStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  newPill: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
    backgroundColor: '#f43f5e',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  adminRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 14,
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  savedErrorRow: { marginTop: 8, gap: 6, alignItems: 'flex-start' },
  savedRetryText: { fontSize: 14, fontWeight: '700' },
});
