import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, useColorScheme, TouchableOpacity, Alert, Switch, Appearance, Platform, Dimensions, TextInput, Modal, KeyboardAvoidingView } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { IMAGE_CACHE_POLICY, imageSource } from '@/lib/images';
import { supabase } from '@/lib/supabase';
import { forgetSession, getUser } from '@/lib/session';
import { unblockUser } from '@/lib/moderation';
import { LogOut, Edit3, MapPin, BookOpen, Moon, Sun, Bookmark, WifiOff, ShieldCheck, ChevronRight, ChevronDown, Ban, Flag, FileText, Plus, Trash2, X, Check, Settings } from 'lucide-react-native';
import { EmptyState } from '@/components/empty-state';
import { CertifiedIcon, isFullyVerified } from '@/components/verified-badge';
import PhotoViewer from '@/components/photo-viewer';
import CityPickerModal from '@/components/city-picker-modal';
import { FALLBACK_INTERESTS, fetchInterests, MIN_INTERESTS } from '@/lib/interests';
import { watchAppSetting } from '@/lib/app-settings';
import { useRouter, useFocusEffect } from 'expo-router';

export default function ProfileScreen() {
  const { width: screenWidth } = Dimensions.get('window');
  const slotSize = (screenWidth - 48 - 24) / 4;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [savedPosts, setSavedPosts] = useState<any[]>([]);
  /** Index de la photo ouverte dans la visionneuse plein ecran, null = fermee. */
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [accountExpanded, setAccountExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [savingField, setSavingField] = useState(false);
  const [cityPickerVisible, setCityPickerVisible] = useState(false);
  const [interestOptions, setInterestOptions] = useState<string[]>(FALLBACK_INTERESTS);
  const [profileOptions, setProfileOptions] = useState<any>({
    gender: [{ label: 'Homme', value: 'homme' }, { label: 'Femme', value: 'femme' }],
    religion: [{ label: 'Christianisme', value: 'christianisme' }, { label: 'Islam', value: 'islam' }, { label: 'Judaïsme', value: 'judaisme' }, { label: 'Bouddhisme', value: 'bouddhisme' }, { label: 'Hindouisme', value: 'hindouisme' }, { label: 'Autre', value: 'autre' }, { label: 'Aucune', value: 'aucune' }],
    blood_types: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    genotypes: [{ label: 'AA', value: 'AA' }, { label: 'AS', value: 'AS' }, { label: 'AC', value: 'AC' }, { label: 'SS', value: 'SS' }, { label: 'SC', value: 'SC' }, { label: 'CC', value: 'CC' }, { label: 'Je ne sais pas', value: 'inconnu' }],
  });
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({ profile_verification: true });
  // Distingue « section vide » de « chargement echoue »
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savedError, setSavedError] = useState<string | null>(null);
  // Comptes bloques par l'utilisateur (section « Comptes bloques »)
  const [blockedList, setBlockedList] = useState<
    { user_id: string; first_name: string; photos: string[] }[]
  >([]);
  // Derniere demande de verification par type : statut + decision non vue
  const [verifState, setVerifState] = useState<
    Record<string, { status: string; unseen: boolean }>
  >({});
  const router = useRouter();
  const profileScrollRef = useRef<ScrollView>(null);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  useEffect(() => {
    const stopOptions = watchAppSetting<any>('profile_options', null, (options) => {
      if (options) setProfileOptions((current: any) => ({ ...current, ...options }));
    });
    const stopFlags = watchAppSetting<Record<string, boolean>>('feature_flags', {}, (flags) => {
      if (flags) setFeatureFlags((current) => ({ ...current, ...flags }));
    });
    return () => { stopOptions(); stopFlags(); };
  }, []);
  const fieldOptions: Record<string, string[]> = {
    gender: profileOptions.gender.map((option: any) => option.value),
    religion: profileOptions.religion.map((option: any) => option.value),
    blood_type: profileOptions.blood_types,
    sickle_cell: profileOptions.genotypes.map((option: any) => option.value),
  };
  const optionLabels: Record<string, string> = Object.fromEntries([
    ...profileOptions.gender, ...profileOptions.religion, ...profileOptions.genotypes,
  ].map((option: any) => [option.value, option.label]));
  const fieldLabels: Record<string, string> = {
    first_name: 'Prénom', last_name: 'Nom', bio: 'Bio', profession: 'Profession',
    religion: 'Religion', city: 'Ville', gender: 'Genre', blood_type: 'Groupe sanguin',
    sickle_cell: 'Génotype', interests: 'Centres d’intérêt',
  };

  const openEditor = async (field: string) => {
    if (field === 'city') { setCityPickerVisible(true); return; }
    if (field === 'interests') {
      try { setInterestOptions(await fetchInterests()); } catch { setInterestOptions(FALLBACK_INTERESTS); }
      setDraftValue(Array.isArray(profile?.interests) ? profile.interests.join('\n') : '');
    } else setDraftValue(profile?.[field] == null ? '' : String(profile[field]));
    setEditingField(field);
  };

  const saveField = async (field: string, value: any): Promise<boolean> => {
    setSavingField(true);
    try {
      const user = await getUser();
      if (!user) throw new Error('Session expirée. Reconnecte-toi.');
      const { error } = await supabase.from('profiles').update({ [field]: value }).eq('user_id', user.id);
      if (error) throw error;
      setProfile((current: any) => {
        const next = { ...current, [field]: value };
        if (field === 'first_name' || field === 'last_name') {
          const composed = `${next.first_name || ''} ${next.last_name || ''}`.trim();
          next.displayName = composed || current.displayName;
        }
        return next;
      });
      setEditingField(null);
      setCityPickerVisible(false);
      return true;
    } catch (error: any) {
      Alert.alert('Modification impossible', error?.message || 'Réessaie dans un instant.');
      return false;
    } finally { setSavingField(false); }
  };

  const addProfilePhoto = async (replacePrimary = false) => {
    if (!replacePrimary && (profile?.photos?.length || 0) >= 6) { Alert.alert('Maximum atteint', 'Tu peux ajouter jusqu’à 6 photos.'); return; }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Accès aux photos', 'Autorise l’accès à ta galerie pour ajouter une photo.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true });
    if (result.canceled || !result.assets[0]?.base64) return;
    try {
      const user = await getUser();
      if (!user) throw new Error('Session expirée.');
      const path = `${user.id}/${replacePrimary ? 0 : (profile?.photos?.length || 0)}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('avatars').upload(path, decode(result.assets[0].base64!), { contentType: 'image/jpeg', upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const oldPhoto = replacePrimary ? profile?.photos?.[0] : null;
      const nextPhotos = [...(profile?.photos || [])];
      if (replacePrimary && nextPhotos.length > 0) nextPhotos[0] = data.publicUrl;
      else if (replacePrimary) nextPhotos.push(data.publicUrl);
      else nextPhotos.push(data.publicUrl);
      const saved = await saveField('photos', nextPhotos);
      const marker = '/object/public/avatars/';
      const oldPath = typeof oldPhoto === 'string' && oldPhoto.includes(marker) ? decodeURIComponent(oldPhoto.split(marker)[1]) : null;
      if (saved && oldPath) await supabase.storage.from('avatars').remove([oldPath]);
    } catch (error: any) { Alert.alert('Ajout impossible', error?.message || 'Réessaie dans un instant.'); }
  };

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
      fetchBlockedList();
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
    } catch {
      // Indicateur purement informatif : un echec ne doit rien bloquer ici.
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
    } catch {
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
    } catch {
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

  const readFunctionError = async (err: any): Promise<string> => {
    try {
      const context = err?.context;
      if (!context) return err?.message || 'Impossible de supprimer le compte.';
      const body = typeof context?.json === 'function'
        ? await context.json()
        : typeof context === 'string'
          ? JSON.parse(context)
          : typeof context?.text === 'function'
            ? JSON.parse(await context.text())
            : context;
      const message = body?.error || err?.message || 'Impossible de supprimer le compte.';
      return body?.step ? `${message}\nÉtape : ${body.step}` : message;
    } catch {
      return err?.message || 'Impossible de supprimer le compte.';
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'SUPPRIMER' || deletingAccount) return;
    setDeletingAccount(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) throw error;
      await forgetSession();
    } catch (error: any) {
      Alert.alert('Erreur', await readFunctionError(error));
      setDeletingAccount(false);
    }
  };

  /** Comptes bloques par l'utilisateur, avec le prénom pour l'affichage. */
  const fetchBlockedList = async () => {
    try {
      const user = await getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('user_blocks')
        .select('blocked_user_id')
        .eq('user_id', user.id);
      if (error) throw error;
      const ids = (data || []).map((r: any) => r.blocked_user_id as string);
      if (ids.length === 0) {
        setBlockedList([]);
        return;
      }
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, first_name, photos')
        .in('user_id', ids);
      const byId = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      setBlockedList(
        ids.map((id) => {
          const p: any = byId.get(id);
          return {
            user_id: id,
            first_name: p?.first_name || 'Utilisateur',
            photos: p?.photos || [],
          };
        })
      );
    } catch {
      // Section silencieuse : un echec ici ne doit pas casser l'ecran Profil.
    }
  };

  const handleUnblock = async (blockedUserId: string) => {
    try {
      const user = await getUser();
      if (!user) return;
      await unblockUser(user.id, blockedUserId);
      setBlockedList((prev) => prev.filter((b) => b.user_id !== blockedUserId));
    } catch {
      Alert.alert('Erreur', 'Impossible de débloquer cet utilisateur');
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
  // Photos exploitables (les trous du tableau sont ecartes) : c'est cette
  // meme liste que reçoit la visionneuse, d'ou l'indexOf pour l'index.
  const photos: string[] = (profile?.photos ?? []).filter(
    (p: any) => typeof p === 'string' && p.length > 0
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.bg }]}>
      <ScrollView ref={profileScrollRef} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.profileTopBar}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[styles.settingsButton, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}
            onPress={() => profileScrollRef.current?.scrollToEnd({ animated: true })}
            accessibilityRole="button"
            accessibilityLabel="Aller aux paramètres du profil"
            activeOpacity={0.75}
          >
            <Settings size={21} color={themeColors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.profileHero}>
          <View style={styles.avatarRing}>
            <Svg width={148} height={148} viewBox="0 0 148 148" style={StyleSheet.absoluteFill}>
              <Circle cx="74" cy="74" r="67" fill="none" stroke={isDark ? '#374151' : '#e5e7eb'} strokeWidth="6" />
              <Circle
                cx="74" cy="74" r="67" fill="none" stroke={themeColors.accent} strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 67}`}
                strokeDashoffset={`${2 * Math.PI * 67 * (1 - completionPercent / 100)}`}
                transform="rotate(-90 74 74)"
              />
            </Svg>
            {photos[0] ? (
              <Image source={imageSource(photos[0])} style={styles.heroAvatar} contentFit="cover" cachePolicy={IMAGE_CACHE_POLICY} recyclingKey="profile-hero-avatar" />
            ) : (
              <View style={[styles.heroAvatar, styles.heroAvatarFallback, { backgroundColor: themeColors.inputBg }]}>
                <Text style={[styles.heroInitial, { color: themeColors.accent }]}>{profile?.displayName?.[0]?.toUpperCase() || 'G'}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.avatarEditButton}
              onPress={() => addProfilePhoto(true)}
              accessibilityRole="button"
              accessibilityLabel="Changer la photo de profil"
              activeOpacity={0.8}
            >
              <Edit3 size={16} color="#111827" />
            </TouchableOpacity>
          </View>
          <View style={styles.completionPill}><Text style={styles.completionPillText}>{completionPercent}% complété</Text></View>
          <TouchableOpacity onPress={() => openEditor('first_name')} activeOpacity={0.75} style={styles.profileNameRow}>
            <Text style={[styles.heroName, { color: themeColors.text }]} numberOfLines={1}>{profile?.displayName}</Text>
            {isFullyVerified(profile) && <CertifiedIcon size={19} />}
            <Edit3 size={14} color={themeColors.icon} />
          </TouchableOpacity>
          <View style={styles.profileMetaRow}>
            <MapPin size={14} color={themeColors.icon} />
            <Text style={[styles.heroLocation, { color: themeColors.textMuted }]}>{profile?.city || 'Ajoute ta ville'}</Text>
            {profile?.age ? <Text style={[styles.heroLocation, { color: themeColors.textMuted }]}>· {profile.age} ans</Text> : null}
          </View>
          <View style={[styles.profileStats, { borderTopColor: themeColors.border }]}>
            <View style={styles.profileStat}><Text style={[styles.statValue, { color: themeColors.text }]}>{profile?.sickle_cell || '—'}</Text><Text style={[styles.statLabel, { color: themeColors.textMuted }]}>Génotype</Text></View>
            <View style={[styles.statDivider, { backgroundColor: themeColors.border }]} />
            <View style={styles.profileStat}><Text style={[styles.statValue, { color: themeColors.text }]}>{profile?.blood_type || '—'}</Text><Text style={[styles.statLabel, { color: themeColors.textMuted }]}>Groupe sanguin</Text></View>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 0, flex: 1 }]}>Mes photos ({photos.length}/6)</Text>
            <Text style={[styles.seeAllText, { color: themeColors.textMuted }]}>Ajouter ou gérer</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
            <TouchableOpacity
              style={[styles.addPhotoTile, { width: slotSize, height: slotSize, backgroundColor: themeColors.accent }]}
              onPress={() => addProfilePhoto()}
              activeOpacity={0.8}
              accessibilityLabel="Ajouter une photo"
            >
              <Plus size={28} color="#ffffff" strokeWidth={3} />
            </TouchableOpacity>
            {photos.map((photo, index) => (
              <TouchableOpacity
                key={`${photo}-${index}`}
                style={[styles.photoThumb, { width: slotSize, height: slotSize }]}
                onPress={() => setViewerIndex(index)}
                activeOpacity={0.85}
                accessibilityLabel={`Voir la photo ${index + 1} en grand`}
              >
                <Image
                  source={imageSource(photo)}
                  style={styles.fullImage}
                  contentFit="cover"
                  cachePolicy={IMAGE_CACHE_POLICY}
                  recyclingKey={`profile-photo-${index}`}
                />
                <TouchableOpacity style={styles.photoRemove} onPress={() => Alert.alert('Supprimer cette photo ?', 'La photo sera retirée de ton profil.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: () => saveField('photos', photos.filter((_: string, i: number) => i !== index)) }])} accessibilityLabel={`Supprimer la photo ${index + 1}`}>
                  <X size={13} color="#fff" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {featureFlags.profile_verification !== false ? <>
        {/* Confiance : identité + génotype */}
        <View style={[styles.card, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <View style={styles.sectionHeader}>
            <ShieldCheck size={20} color={themeColors.accent} />
            <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 0, flex: 1 }]}>Faire vérifier mon profil</Text>
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

          {isAdmin && (
            <TouchableOpacity
              style={[styles.adminRow, { borderTopColor: themeColors.border }]}
              onPress={() => router.push('/admin/reports')}
              activeOpacity={0.8}
            >
              <Flag size={18} color={themeColors.accent} />
              <Text style={[styles.infoText, { color: themeColors.text, flex: 1 }]}>
                Signalements
              </Text>
              <ChevronRight size={18} color={themeColors.icon} />
            </TouchableOpacity>
          )}
        </View>
        </> : null}

        {/* Tags */}
        <View style={[styles.card, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 0, flex: 1 }]}>Tags</Text>
            <TouchableOpacity onPress={() => openEditor('interests')} activeOpacity={0.7}>
              <Text style={[styles.seeAllText, { color: themeColors.accent }]}>Modifier</Text>
            </TouchableOpacity>
          </View>
          {profile?.interests?.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagsContainer}>
              {profile.interests.map((tag: string, i: number) => {
                const tagPalette = [
                  { bg: '#fef08a', text: '#713f12' },
                  { bg: '#bfdbfe', text: '#1e3a8a' },
                  { bg: '#a5f3fc', text: '#155e75' },
                  { bg: '#bbf7d0', text: '#14532d' },
                  { bg: '#fbcfe8', text: '#831843' },
                ][i % 5];
                return (
                  <View key={`${tag}-${i}`} style={[styles.tagBadge, { backgroundColor: tagPalette.bg }]}>
                    <Text style={[styles.tagText, { color: tagPalette.text }]}>{tag.toUpperCase()}</Text>
                  </View>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={{ color: themeColors.textMuted }}>Ajoute des centres d’intérêt à ton profil.</Text>
          )}
        </View>

        {/* Bio */}
        <View style={[styles.card, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 0, flex: 1 }]}>Bio</Text>
            <TouchableOpacity onPress={() => openEditor('bio')} activeOpacity={0.7}>
              <Edit3 size={16} color={themeColors.icon} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => openEditor('bio')} activeOpacity={0.75}>
          <Text style={[styles.bioText, { color: profile?.bio ? themeColors.text : themeColors.icon }]}>
            {profile?.bio || 'Décris-toi en quelques mots'}
          </Text>
          </TouchableOpacity>
        </View>

        {/* Profession */}
        <View style={[styles.card, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 0, flex: 1 }]}>Profession</Text>
            <TouchableOpacity onPress={() => openEditor('profession')} activeOpacity={0.7}>
              <Edit3 size={16} color={themeColors.icon} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => openEditor('profession')} activeOpacity={0.75}>
          <Text style={[styles.fieldValue, { color: profile?.profession ? themeColors.text : themeColors.icon, backgroundColor: themeColors.inputBg }]}>
            {profile?.profession || 'Ton métier'}
          </Text>
          </TouchableOpacity>
        </View>

        {/* Informations du profil */}
        <View style={[styles.card, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 0, flex: 1 }]}>Informations</Text>
            <Text style={[styles.seeAllText, { color: themeColors.textMuted }]}>Touche une ligne pour modifier</Text>
          </View>
          {([
            ['first_name', Edit3, profile?.first_name || 'Ajouter un prénom'],
            ['last_name', Edit3, profile?.last_name || 'Ajouter un nom'],
            ['religion', BookOpen, profile?.religion || 'Ajouter une religion'],
            ['city', MapPin, profile?.city || 'Ajouter une ville'],
            ['gender', Edit3, profile?.gender || 'Ajouter un genre'],
            ['blood_type', ShieldCheck, profile?.blood_type || 'Ajouter un groupe sanguin'],
            ['sickle_cell', ShieldCheck, profile?.sickle_cell || 'Ajouter un génotype'],
          ] as const).map(([field, Icon, value]) => (
            <TouchableOpacity key={field} style={[styles.editableRow, { borderBottomColor: themeColors.border }]} onPress={() => openEditor(field)} activeOpacity={0.7}>
              <Icon size={19} color={themeColors.icon} />
              <View style={{ flex: 1 }}><Text style={[styles.rowLabel, { color: themeColors.textMuted }]}>{fieldLabels[field]}</Text><Text style={[styles.infoText, { color: value.startsWith('Ajouter') ? themeColors.icon : themeColors.text }]}>{value}</Text></View>
              <Edit3 size={15} color={themeColors.icon} />
            </TouchableOpacity>
          ))}
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

        {/* Comptes bloqués */}
        <View style={[styles.card, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <View style={styles.sectionHeader}>
            <Ban size={20} color={themeColors.accent} />
            <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 0 }]}>Comptes bloqués</Text>
          </View>
          {blockedList.length > 0 ? (
            blockedList.map((b) => (
              <View key={b.user_id} style={styles.infoRow}>
                {b.photos?.[0] ? (
                  <Image
                    source={imageSource(b.photos[0])}
                    style={{ width: 40, height: 40, borderRadius: 20 }}
                    cachePolicy={IMAGE_CACHE_POLICY}
                    recyclingKey={`blocked-${b.user_id}`}
                  />
                ) : (
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: themeColors.inputBg,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: themeColors.textMuted, fontWeight: 'bold' }}>
                      {b.first_name?.[0] || '?'}
                    </Text>
                  </View>
                )}
                <Text style={[styles.infoText, { color: themeColors.text, flex: 1 }]} numberOfLines={1}>
                  {b.first_name}
                </Text>
                <TouchableOpacity onPress={() => handleUnblock(b.user_id)} activeOpacity={0.7}>
                  <Text style={{ color: themeColors.accent, fontWeight: '600', fontSize: 14 }}>Débloquer</Text>
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>Aucun compte bloqué.</Text>
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

        <View style={[styles.card, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Sécurité et confidentialité</Text>

          {featureFlags.profile_verification !== false ? <TouchableOpacity
            style={[styles.settingRow, { borderBottomColor: themeColors.border }]}
            onPress={() => router.push('/verification')}
            activeOpacity={0.75}
          >
            <ShieldCheck size={19} color={themeColors.icon} />
            <Text style={[styles.settingRowText, { color: themeColors.text }]}>Vérification du profil</Text>
            <ChevronRight size={18} color={themeColors.icon} />
          </TouchableOpacity> : null}
          <TouchableOpacity
            style={[styles.settingRow, { borderBottomColor: themeColors.border }]}
            onPress={() => router.push('/legal/privacy')}
            activeOpacity={0.75}
          >
            <FileText size={19} color={themeColors.icon} />
            <Text style={[styles.settingRowText, { color: themeColors.text }]}>Politique de confidentialité</Text>
            <ChevronRight size={18} color={themeColors.icon} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.settingRow, { borderBottomColor: themeColors.border }]}
            onPress={() => router.push('/legal/terms')}
            activeOpacity={0.75}
          >
            <FileText size={19} color={themeColors.icon} />
            <Text style={[styles.settingRowText, { color: themeColors.text }]}>Conditions d’utilisation</Text>
            <ChevronRight size={18} color={themeColors.icon} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.settingRow, { borderBottomWidth: 0 }]}
            onPress={() => setAccountExpanded((expanded) => !expanded)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={{ expanded: accountExpanded }}
          >
            <Trash2 size={19} color={themeColors.icon} />
            <Text style={[styles.settingRowText, { color: themeColors.text }]}>Gestion du compte</Text>
            {accountExpanded ? <ChevronDown size={18} color={themeColors.icon} /> : <ChevronRight size={18} color={themeColors.icon} />}
          </TouchableOpacity>

          {accountExpanded && (
            <View style={[styles.accountPanel, { borderTopColor: themeColors.border }]}>
              <Text style={[styles.accountTitle, { color: themeColors.text }]}>Suppression du compte</Text>
              <Text style={[styles.accountDescription, { color: themeColors.textMuted }]}>
                Ton compte et tes données seront définitivement supprimés. Cette action est irréversible.
              </Text>
              {!confirmDelete ? (
                <TouchableOpacity
                  style={styles.deleteOutlineButton}
                  onPress={() => setConfirmDelete(true)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.deleteOutlineText}>Supprimer mon compte</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.deleteConfirmBox}>
                  <Text style={[styles.accountDescription, { color: themeColors.text }]}>
                    Pour confirmer, saisis SUPPRIMER. Ton profil, tes photos, matchs et messages seront effacés.
                  </Text>
                  <TextInput
                    value={deleteConfirmation}
                    onChangeText={setDeleteConfirmation}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!deletingAccount}
                    placeholder="SUPPRIMER"
                    placeholderTextColor={themeColors.icon}
                    style={[styles.deleteInput, { color: themeColors.text, backgroundColor: themeColors.inputBg, borderColor: themeColors.border }]}
                    accessibilityLabel="Saisir SUPPRIMER pour confirmer"
                  />
                  <TouchableOpacity
                    style={[styles.deleteConfirmButton, deleteConfirmation !== 'SUPPRIMER' && styles.disabledButton]}
                    disabled={deleteConfirmation !== 'SUPPRIMER' || deletingAccount}
                    onPress={handleDeleteAccount}
                    activeOpacity={0.75}
                  >
                    {deletingAccount ? <ActivityIndicator color="#ef4444" /> : null}
                    <Text style={styles.deleteOutlineText}>{deletingAccount ? 'Suppression…' : 'Confirmer la suppression'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ alignItems: 'center', paddingVertical: 12 }}
                    disabled={deletingAccount}
                    onPress={() => {
                      setDeleteConfirmation('');
                      setConfirmDelete(false);
                    }}
                  >
                    <Text style={{ color: themeColors.textMuted, fontWeight: '600' }}>Annuler</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>

        <TouchableOpacity 
          style={[styles.outlineBtn, { borderColor: themeColors.border }]} 
          activeOpacity={0.7}
          onPress={handleSignOut}
        >
          <LogOut color="#ef4444" size={20} />
          <Text style={[styles.outlineBtnText, { color: '#ef4444' }]}>Se déconnecter</Text>
        </TouchableOpacity>

        <Text style={[styles.versionText, { color: themeColors.textMuted }]}>Geno · 1.0.1</Text>

      </ScrollView>

      {/* Visionneuse plein ecran des photos du profil */}
      <PhotoViewer
        visible={viewerIndex !== null}
        photos={photos}
        index={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
      />
      <Modal visible={!!editingField} transparent animationType="slide" onRequestClose={() => setEditingField(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={[styles.editorSheet, { backgroundColor: themeColors.bgCard }]}>
            <View style={styles.editorHeader}>
              <Text style={[styles.editorTitle, { color: themeColors.text }]}>{fieldLabels[editingField || ''] || 'Modifier'}</Text>
              <TouchableOpacity onPress={() => setEditingField(null)}><X size={22} color={themeColors.icon} /></TouchableOpacity>
            </View>
            {editingField === 'interests' ? (
              <>
                <Text style={[styles.editorHint, { color: themeColors.textMuted }]}>Choisis au moins {MIN_INTERESTS} centres d’intérêt.</Text>
                <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={styles.interestChoices}>
                  {interestOptions.map((interest) => {
                    const selected = draftValue.split('\n').filter(Boolean).includes(interest);
                    return <TouchableOpacity key={interest} onPress={() => {
                      const values = draftValue.split('\n').filter(Boolean);
                      setDraftValue(selected ? values.filter((item) => item !== interest).join('\n') : [...values, interest].join('\n'));
                    }} style={[styles.interestChoice, { backgroundColor: selected ? '#f43f5e' : themeColors.inputBg }]}>
                      <Text style={{ color: selected ? '#fff' : themeColors.text, fontWeight: '700' }}>{interest}</Text>
                    </TouchableOpacity>;
                  })}
                </ScrollView>
              </>
            ) : fieldOptions[editingField || ''] ? (
              <View style={styles.interestChoices}>
                {fieldOptions[editingField || ''].map((option) => (
                  <TouchableOpacity key={option} onPress={() => setDraftValue(option)} style={[styles.optionChoice, { backgroundColor: draftValue === option ? '#f43f5e' : themeColors.inputBg }]}>
                      <Text style={{ color: draftValue === option ? '#fff' : themeColors.text, fontWeight: '600' }}>{optionLabels[option] || option}</Text>
                    {draftValue === option && <Check size={17} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <TextInput
                value={draftValue}
                onChangeText={setDraftValue}
                placeholder={editingField === 'bio' ? 'Décris-toi en quelques mots' : fieldLabels[editingField || '']}
                placeholderTextColor={themeColors.icon}
                multiline={editingField === 'bio'}
                maxLength={editingField === 'bio' ? 500 : 80}
                autoCapitalize="sentences"
                style={[styles.editorInput, { color: themeColors.text, backgroundColor: themeColors.inputBg, borderColor: themeColors.border, minHeight: editingField === 'bio' ? 130 : 54 }]}
              />
            )}
            <TouchableOpacity
              disabled={savingField || (editingField === 'interests' && draftValue.split('\n').filter(Boolean).length < MIN_INTERESTS)}
              style={[styles.saveFieldButton, (savingField || (editingField === 'interests' && draftValue.split('\n').filter(Boolean).length < MIN_INTERESTS)) && { opacity: 0.5 }]}
              onPress={() => {
                const field = editingField;
                if (!field) return;
                const value = field === 'interests' ? draftValue.split('\n').filter(Boolean) : draftValue.trim() || null;
                saveField(field, value);
              }}
            >
              {savingField ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveFieldText}>Enregistrer</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <CityPickerModal
        visible={cityPickerVisible}
        selectedCity={profile?.city}
        countryCode={profile?.country_code}
        theme={themeColors}
        onClose={() => setCityPickerVisible(false)}
        onSelect={(city) => saveField('city', city || null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  profileTopBar: { height: 46, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  settingsButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  profileHero: { alignItems: 'center', marginBottom: 16, paddingTop: 1 },
  avatarRing: { width: 148, height: 148, alignItems: 'center', justifyContent: 'center' },
  heroAvatar: { width: 119, height: 119, borderRadius: 60, borderWidth: 4, borderColor: '#ffffff' },
  avatarEditButton: { position: 'absolute', right: 4, top: 21, width: 34, height: 34, borderRadius: 17, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  heroAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  heroInitial: { fontSize: 40, fontWeight: '900' },
  completionPill: { marginTop: -2, backgroundColor: '#facc15', borderRadius: 16, paddingHorizontal: 13, paddingVertical: 5, zIndex: 1 },
  completionPillText: { color: '#111827', fontSize: 13, fontWeight: '800' },
  profileNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 11, maxWidth: '90%' },
  heroName: { fontSize: 25, fontWeight: '900', letterSpacing: -0.5 },
  profileMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 5 },
  heroLocation: { fontSize: 13 },
  profileStats: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 14, paddingTop: 12 },
  profileStat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 35 },
  card: { borderRadius: 22, padding: 17, borderWidth: 1, marginBottom: 13, shadowColor: '#111827', shadowOpacity: 0.035, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 16, letterSpacing: -0.2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  infoText: { fontSize: 16 },
  bioText: { fontSize: 15, lineHeight: 22 },
  fieldValue: { minHeight: 48, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 14, backgroundColor: 'rgba(156, 163, 175, 0.12)', fontSize: 15 },
  seeAllText: { fontSize: 13, fontWeight: '600' },
  photoRow: { flexDirection: 'row', gap: 9, paddingRight: 2 },
  addPhotoTile: { borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  photoThumb: { borderRadius: 16, overflow: 'hidden' },
  photoRemove: { position: 'absolute', top: 5, right: 5, width: 23, height: 23, borderRadius: 12, backgroundColor: 'rgba(17,24,39,0.72)', alignItems: 'center', justifyContent: 'center' },
  fullImage: { width: '100%', height: '100%' },
  tagsContainer: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  tagBadge: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9 },
  tagText: { fontSize: 12, fontWeight: '800' },
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
  settingRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  settingRowText: { flex: 1, fontSize: 15, fontWeight: '500' },
  accountPanel: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 17, marginTop: 4 },
  accountTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  accountDescription: { fontSize: 13, lineHeight: 19 },
  deleteOutlineButton: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ef4444', borderRadius: 13, minHeight: 48, marginTop: 14 },
  deleteOutlineText: { color: '#ef4444', fontSize: 14, fontWeight: '700' },
  deleteConfirmBox: { marginTop: 14 },
  deleteInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, marginTop: 12, fontSize: 15, letterSpacing: 1 },
  deleteConfirmButton: { minHeight: 48, borderWidth: 1, borderColor: '#ef4444', borderRadius: 13, marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  disabledButton: { opacity: 0.45 },
  versionText: { fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 10 },
  editableRow: { minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowLabel: { fontSize: 12, marginBottom: 3 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.48)', justifyContent: 'flex-end' },
  editorSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 34, maxHeight: '85%' },
  editorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  editorTitle: { fontSize: 21, fontWeight: '800' },
  editorHint: { fontSize: 14, marginBottom: 14 },
  editorInput: { borderWidth: 1, borderRadius: 16, padding: 15, fontSize: 16, textAlignVertical: 'top' },
  interestChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, paddingBottom: 10 },
  interestChoice: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 13 },
  optionChoice: { minWidth: '47%', paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  saveFieldButton: { minHeight: 52, borderRadius: 16, backgroundColor: '#f43f5e', alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  saveFieldText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
