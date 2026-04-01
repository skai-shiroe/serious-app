import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, ActivityIndicator, useColorScheme, TouchableOpacity, Alert, Switch, Appearance } from 'react-native';
import { supabase } from '@/lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LogOut, Edit3, MapPin, BookOpen, Briefcase, Droplet, Activity, Calendar, Moon, Sun } from 'lucide-react-native';
import { useRouter, useFocusEffect } from 'expo-router';

export default function ProfileScreen() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
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
  };

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [])
  );

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      
      setProfile({
        ...data,
        firstName: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Utilisateur',
      });
    } catch (error: any) {
      console.log('Error fetching profile', error);
    } finally {
      setLoading(false);
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
    try {
      await AsyncStorage.setItem('appTheme', newTheme);
    } catch(e) {}
  };

  const calculateCompletion = () => {
    if (!profile) return 0;
    const fields = [
      profile.age,
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

  const completionPercent = calculateCompletion();
  const mainPhoto = profile?.photos?.[0] || 'https://via.placeholder.com/150';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.bg }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        <View style={styles.header}>
          <Text style={[styles.title, { color: themeColors.text }]}>Mon Profil</Text>
        </View>

        <View style={styles.profileHeader}>
          <LinearGradient colors={['#f43f5e', '#ec4899']} style={styles.avatarGradient}>
            <Image source={{ uri: mainPhoto }} style={styles.avatarLarge} />
          </LinearGradient>
          <Text style={[styles.name, { color: themeColors.text }]}>
            {profile?.firstName}
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
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Mes centres d'intérêt</Text>
          {profile?.interests?.length > 0 ? (
            <View style={styles.tagsContainer}>
              {profile.interests.map((tag: string, i: number) => (
                <View key={i} style={[styles.tagBadge, { backgroundColor: 'rgba(244, 63, 94, 0.1)' }]}>
                  <Text style={[styles.tagText, { color: '#f43f5e' }]}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ color: themeColors.textMuted }}>Aucun centre d'intérêt renseigné</Text>
          )}
        </View>

        {/* Photos */}
        <View style={[styles.card, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Mes photos</Text>
          <View style={styles.photosGrid}>
            {Array.from({ length: 6 }).map((_, i) => {
              const uri = profile?.photos?.[i];
              return uri ? (
                <Image key={i} source={{ uri }} style={styles.photoSlot} />
              ) : (
                <View key={i} style={[styles.photoSlot, { backgroundColor: themeColors.inputBg }]} />
              );
            })}
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
  photosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoSlot: { width: '31%', aspectRatio: 0.75, borderRadius: 12 },
  actionBtn: { marginTop: 8, marginBottom: 16, shadowColor: '#f43f5e', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  gradientBtn: { borderRadius: 28, paddingVertical: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  btnText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
  outlineBtn: { borderRadius: 28, paddingVertical: 16, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  outlineBtnText: { fontSize: 16, fontWeight: '600', marginLeft: 8 },
});
