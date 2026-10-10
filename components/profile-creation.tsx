import { supabase } from '@/lib/supabase';
import { forgetSession, getUser } from '@/lib/session';
import CityPickerModal from '@/components/city-picker-modal';
import { IMAGE_CACHE_POLICY } from '@/lib/images';
import { decode } from 'base64-arraybuffer';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Activity, Camera, ChevronLeft, ChevronRight, CircleAlert, Heart, Images, MapPin, User } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useColorScheme, View, } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ProfileCreationProps {
  onComplete: () => void;
  initialData?: any;
}

/** Etat d'un emplacement photo : preview locale, puis URL publique. */
type PhotoSlot = {
  /** URI affichee : fichier local pendant l'envoi, URL publique ensuite. */
  uri: string;
  /** Chemin du fichier DEJA stocke pour cet emplacement (a supprimer si remplace). */
  storedPath?: string;
  /** URL de la photo precedente : conservee pour ne pas la perdre si l'envoi echoue. */
  previousUri?: string;
  status: 'uploading' | 'ready' | 'error';
};

const MAX_PHOTOS = 6;
/** Qualite JPEG demandee au picker : 0.6 suffit largement pour un mobile. */
const PHOTO_QUALITY = 0.6;

/** Resultat d'un envoi de photo : l'URL publique, ou null si echec. */
type PhotoUploadResult = { index: number; url: string } | null;

/**
 * Retrouve le chemin dans le bucket a partir d'une URL publique Supabase.
 * Sert a supprimer l'ancien fichier quand on remplace une photo deja stockee
 * (cas du profil edite) : sans cela, chaque remplacement laisserait un
 * orphelin dans `avatars`.
 */
function storagePathFromUrl(publicUrl?: string | null): string | undefined {
  if (!publicUrl) return undefined;

  const marker = '/object/public/avatars/';
  const index = publicUrl.indexOf(marker);
  if (index === -1) return undefined;

  return decodeURIComponent(publicUrl.slice(index + marker.length));
}

// ── Picker modal simplifié ──────────────────────────────────────────────
interface PickerOption {
  label: string;
  value: string;
}

function SimplePicker({
  label,
  options,
  selectedValue,
  onSelect,
  placeholder,
  themeColors,
}: {
  label: string;
  options: PickerOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
  placeholder: string;
  themeColors: any;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.inputGroup}>
      <Text style={[styles.label, { color: themeColors.text }]}>{label}</Text>
      <TouchableOpacity
        style={[
          styles.pickerBtn,
          { backgroundColor: themeColors.inputBg, borderColor: themeColors.border },
        ]}
        onPress={() => setOpen(!open)}
        activeOpacity={0.7}
      >
        <Text
          style={{
            color: selectedValue ? themeColors.text : themeColors.icon,
            fontSize: 16,
          }}
        >
          {selectedValue
            ? options.find((o) => o.value === selectedValue)?.label ?? placeholder
            : placeholder}
        </Text>
        <ChevronRight color={themeColors.icon} size={18} />
      </TouchableOpacity>

      {open && (
        <View style={[styles.optionsList, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.optionItem,
                { borderBottomColor: themeColors.border },
                selectedValue === opt.value && { backgroundColor: 'rgba(244,63,94,0.1)' },
              ]}
              onPress={() => {
                onSelect(opt.value);
                setOpen(false);
              }}
            >
              <Text
                style={{
                  color: selectedValue === opt.value ? '#f43f5e' : themeColors.text,
                  fontSize: 15,
                  fontWeight: selectedValue === opt.value ? '600' : '400',
                }}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const INTERESTS_LIST = ['Sport', 'Voyage', 'Musique', 'Cinéma', 'Lecture', 'Cuisine', 'Art', 'Jeux vidéo', 'Technologie', 'Nature', 'Photographie', 'Mode', 'Animaux', 'Fitness', 'Danse'];

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const SICKLE_CELL_STATUS = [
  { label: 'AA (Aucun trait)', value: 'AA' },
  { label: 'AS (Porteur sain)', value: 'AS' },
  { label: 'SS (Drépanocytaire)', value: 'SS' },
  { label: 'Je ne sais pas', value: 'inconnu' },
];

// ── Composant principal ─────────────────────────────────────────────────
export default function ProfileCreation({ onComplete, initialData }: ProfileCreationProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Emplacements photo : 6 maximum, pre-remplis depuis le profil existant.
  const [photos, setPhotos] = useState<(PhotoSlot | null)[]>(() => {
    const slots: (PhotoSlot | null)[] = Array.from({ length: MAX_PHOTOS }, () => null);
    const existing: (string | null)[] = initialData?.photos || [];
    existing.slice(0, MAX_PHOTOS).forEach((uri, index) => {
      if (uri) slots[index] = { uri, status: 'ready' };
    });
    return slots;
  });

  // Miroir de l'etat : handleSave a besoin de la valeur courante APRES avoir
  // attendu les envois encore en vol.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  // Le base64 n'est conserve QUE pendant un envoi, ou pour permettre un
  // "Reessayer" apres echec : jamais les 6 photos d'un coup en memoire
  // (c'etait ~20 Mo de chaines base64, d'ou les saccades de cet ecran).
  const base64Cache = useRef<Map<number, string>>(new Map());
  // Envois en cours, par emplacement.
  const uploadTasks = useRef<Map<number, Promise<PhotoUploadResult>>>(new Map());
  const [formData, setFormData] = useState({
    firstName: initialData?.first_name || '',
    lastName: initialData?.last_name || '',
    gender: initialData?.gender || '',
    city: initialData?.city || '',
    religion: initialData?.religion || '',
    profession: initialData?.profession || '',
    interests: initialData?.interests || ([] as string[]),
    bloodType: initialData?.blood_type || '',
    sickleCell: initialData?.sickle_cell || '',
    bio: initialData?.bio || '',
  });

  const [cityModalVisible, setCityModalVisible] = useState(false);

  // Pour la saisie structurée de la date de naissance
  const [bd, setBd] = useState({
    day: initialData?.birth_date ? initialData.birth_date.split('-')[2] : '',
    month: initialData?.birth_date ? initialData.birth_date.split('-')[1] : '',
    year: initialData?.birth_date ? initialData.birth_date.split('-')[0] : '',
  });

  // Refs des trois champs : permet de passer au suivant automatiquement.
  const dayRef = useRef<TextInput>(null);
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  /** Ne garde que les chiffres et borne la longueur (collage compris). */
  const onlyDigits = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max);

  const handleDayChange = (value: string) => {
    const day = onlyDigits(value, 2);
    setBd((prev) => ({ ...prev, day }));
    if (day.length === 2) monthRef.current?.focus(); // JJ complet -> MM
  };

  const handleMonthChange = (value: string) => {
    const month = onlyDigits(value, 2);
    setBd((prev) => ({ ...prev, month }));
    if (month.length === 2) yearRef.current?.focus(); // MM complet -> AAAA
  };

  const handleYearChange = (value: string) => {
    const year = onlyDigits(value, 4);
    setBd((prev) => ({ ...prev, year }));
    if (year.length === 4) Keyboard.dismiss(); // annee complete : on referme le clavier
  };

  // Retour arriere sur un champ vide : on revient au champ precedent.
  const handleMonthKeyPress = ({ nativeEvent }: any) => {
    if (nativeEvent.key === 'Backspace' && bd.month.length === 0) dayRef.current?.focus();
  };

  const handleYearKeyPress = ({ nativeEvent }: any) => {
    if (nativeEvent.key === 'Backspace' && bd.year.length === 0) monthRef.current?.focus();
  };

  const calculateAge = (day: string, month: string, year: string) => {
    if (!day || !month || !year || year.length < 4) return null;
    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    if (isNaN(d) || isNaN(m) || isNaN(y)) return null;

    const birthDate = new Date(y, m - 1, d);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  /** Supprime un fichier du bucket (best effort : jamais bloquant). */
  const removeStoredPhoto = async (path: string) => {
    try {
      await supabase.storage.from('avatars').remove([path]);
    } catch (error) {
      console.warn('[Profil] ancienne photo non supprimée', path, error);
    }
  };

  /**
   * Envoie une photo TOUT DE SUITE (au choix, pas a la fin) : le formulaire
   * reste utilisable pendant l'upload, et le base64 est libere des que l'envoi
   * est termine (seule l'URL publique reste en memoire).
   */
  const startPhotoUpload = (
    index: number,
    localUri: string,
    base64: string,
    storedPath?: string,
    previousUri?: string
  ) => {
    base64Cache.current.set(index, base64);
    setPhotos((prev) => {
      const next = [...prev];
      next[index] = { uri: localUri, storedPath, previousUri, status: 'uploading' };
      return next;
    });

    const task = (async () => {
      try {
        const user = await getUser();
        if (!user) throw new Error('Utilisateur non connecté');

        // Nom versionne : expo-image met les images en cache par URL, un chemin
        // fige afficherait l'ancienne photo. L'ancien fichier est supprime
        // juste apres, donc aucun orphelin dans le bucket.
        const path = `${user.id}/${index}-${Date.now()}.jpg`;
        const { error } = await supabase.storage
          .from('avatars')
          .upload(path, decode(base64), { contentType: 'image/jpeg', upsert: true });

        if (error) throw error;

        const { data } = supabase.storage.from('avatars').getPublicUrl(path);

        base64Cache.current.delete(index);
        setPhotos((prev) => {
          const next = [...prev];
          next[index] = { uri: data.publicUrl, storedPath: path, status: 'ready' };
          return next;
        });

        if (storedPath) void removeStoredPhoto(storedPath);

        return { index, url: data.publicUrl };
      } catch (error: any) {
        console.warn(`[Profil] envoi photo ${index} échoué :`, error?.message || error);
        // On garde le base64 pour ce seul emplacement : "Réessayer" ne
        // repassera pas par la galerie.
        setPhotos((prev) => {
          const next = [...prev];
          next[index] = { uri: localUri, storedPath, previousUri, status: 'error' };
          return next;
        });
        return null;
      } finally {
        uploadTasks.current.delete(index);
      }
    })();

    uploadTasks.current.set(index, task);
  };

  const handlePickImage = async (index: number) => {
    const current = photosRef.current[index];
    // Photo deja stockee (bucket) : on saura supprimer l'ancien fichier.
    const previousPath = current?.storedPath ?? storagePathFromUrl(current?.uri);
    const previousUri = current?.status === 'ready' ? current.uri : current?.previousUri;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: PHOTO_QUALITY,
      base64: true,
    });

    const asset = result.assets?.[0];
    if (result.canceled || !asset?.base64) return;

    startPhotoUpload(index, asset.uri, asset.base64, previousPath, previousUri);
  };

  /** Remplit d'un geste les emplacements libres (sans recadrage). */
  const handlePickMultiple = async () => {
    const freeSlots = photosRef.current
      .map((slot, index) => (slot ? -1 : index))
      .filter((index) => index >= 0);

    if (freeSlots.length === 0) {
      Alert.alert('Photos', 'Vos 6 emplacements sont déjà remplis. Touchez une photo pour la remplacer.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: freeSlots.length,
      quality: PHOTO_QUALITY,
      base64: true,
    });

    if (result.canceled) return;

    // Envois en PARALLELE (avant : boucle sequentielle qui additionnait les
    // temps d'envoi des 6 photos).
    result.assets.slice(0, freeSlots.length).forEach((asset, i) => {
      if (asset.base64) startPhotoUpload(freeSlots[i], asset.uri, asset.base64);
    });
  };

  const handleSlotPress = (index: number) => {
    const slot = photosRef.current[index];

    if (slot?.status === 'uploading') return; // deja en cours

    if (slot?.status === 'error') {
      Alert.alert(
        'Photo non envoyée',
        "L'envoi de cette photo a échoué. Vous pouvez réessayer ou en choisir une autre.",
        [
          { text: 'Choisir une autre', style: 'cancel', onPress: () => handlePickImage(index) },
          {
            text: 'Réessayer',
            onPress: () => {
              const base64 = base64Cache.current.get(index);
              if (base64) {
                startPhotoUpload(index, slot.uri, base64, slot.storedPath, slot.previousUri);
              }
            },
          },
        ]
      );
      return;
    }

    handlePickImage(index);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const user = await getUser();
      if (!user) throw new Error("Utilisateur non connecté");

      // 1) Les photos partent des le choix : on n'attend que le reliquat.
      const tasks = Array.from(uploadTasks.current.entries());
      const settled =
        tasks.length > 0
          ? await Promise.all(tasks.map(([, task]) => task))
          : ([] as PhotoUploadResult[]);

      // 2) URLs par emplacement : etat courant + resultats tout justes arrives.
      const urlByIndex = new Map<number, string>();
      const failedIndexes = new Set<number>();

      photosRef.current.forEach((slot, index) => {
        if (slot?.status === 'ready') urlByIndex.set(index, slot.uri);
        if (slot?.status === 'error') {
          failedIndexes.add(index);
          // Remplacement rate : on garde la photo precedente si elle existait.
          if (slot.previousUri) urlByIndex.set(index, slot.previousUri);
        }
      });

      settled.forEach((result, i) => {
        const index = tasks[i][0];
        if (result) {
          urlByIndex.set(index, result.url);
          failedIndexes.delete(index);
        } else {
          failedIndexes.add(index);
        }
      });

      // 3) Une photo en echec ne fait plus echouer tout le profil.
      if (failedIndexes.size > 0) {
        const keepGoing = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Photos non envoyées',
            `${failedIndexes.size} photo${failedIndexes.size > 1 ? 's' : ''} n'a pas pu être envoyée. Continuer sans ?`,
            [
              { text: 'Réessayer', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continuer sans', onPress: () => resolve(true) },
            ],
            { cancelable: false }
          );
        });
        if (!keepGoing) return;
      }

      const uploadedUrls = [...urlByIndex.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, url]) => url);

      // Record profile
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          first_name: formData.firstName,
          last_name: formData.lastName,
          birth_date: bd.year && bd.month && bd.day ? `${bd.year}-${bd.month.padStart(2, '0')}-${bd.day.padStart(2, '0')}` : null,
          gender: formData.gender,
          city: formData.city,
          religion: formData.religion,
          profession: formData.profession,
          interests: formData.interests,
          blood_type: formData.bloodType,
          sickle_cell: formData.sickleCell,
          bio: formData.bio,
          photos: uploadedUrls
        }, { onConflict: 'user_id' });

      if (profileError) throw profileError;

      onComplete();
    } catch (error: any) {
      // 23503 = cle etrangere profiles.user_id -> auth.users violee : le compte
      // n'existe plus cote Supabase, la session locale est orpheline.
      const isDeadSession =
        error?.code === '23503' ||
        error?.code === 'PGRST301' ||
        error?.status === 401 ||
        String(error?.message || '').includes('profiles_user_id_fkey');

      if (isDeadSession) {
        await forgetSession();
        Alert.alert(
          'Session expirée',
          "Votre compte n'est plus valide. Reconnectez-vous pour continuer."
        );
        return;
      }

      Alert.alert("Erreur", error.message || "Une erreur est survenue lors de la sauvegarde.");
    } finally {
      setLoading(false);
    }
  };

  const toggleInterest = (interest: string) => {
    setFormData(prev => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter((i: string) => i !== interest)
        : [...prev.interests, interest]
    }));
  };

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const totalSteps = 4;

  const themeColors = {
    text: isDark ? '#ffffff' : '#111827',
    textMuted: isDark ? '#d1d5db' : '#4b5563',
    bgCard: isDark ? '#1f2937' : '#ffffff',
    border: isDark ? '#374151' : '#e5e7eb',
    inputBg: isDark ? '#374151' : '#ffffff',
    icon: '#9ca3af',
    infoBg: isDark ? 'rgba(59,130,246,0.15)' : '#eff6ff',
    infoBorder: isDark ? '#1e40af' : '#bfdbfe',
    infoText: isDark ? '#93c5fd' : '#1e40af',
  };

  const handleNext = () => {
    // Étape 1 : ces champs conditionnent le matching — le genre impose le deck
    // (matching strict, voir lib/candidates.ts) et la date de naissance sert au
    // filtre d'âge. Ils sont donc obligatoires avant d'avancer.
    if (step === 1) {
      const missing: string[] = [];
      if (!formData.firstName.trim()) missing.push('le prénom');
      if (!formData.lastName.trim()) missing.push('le nom');
      if (!formData.gender) missing.push('le genre');
      if (!bd.day || !bd.month || bd.year.length < 4) missing.push('la date de naissance');

      if (missing.length > 0) {
        Alert.alert(
          'Informations manquantes',
          `Merci de renseigner ${missing.join(', ')} pour continuer.`
        );
        return;
      }

      const age = calculateAge(bd.day, bd.month, bd.year);
      if (age !== null && age < 18) {
        Alert.alert(
          'Âge minimum',
          "L'application est réservée aux personnes majeures (18 ans et plus)."
        );
        return;
      }
    }

    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      handleSave();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  // ── Étape 1 : Informations personnelles ─────────────────────────────
  const renderStep1 = () => (
    <View>
      <View style={styles.stepHeader}>
        <LinearGradient colors={['#f43f5e', '#ec4899']} style={styles.stepIcon}>
          <User color="#ffffff" size={28} />
        </LinearGradient>
        <Text style={[styles.stepTitle, { color: themeColors.text }]}>
          Informations personnelles
        </Text>
        <Text style={[styles.stepSubtitle, { color: themeColors.textMuted }]}>
          Parlez-nous de vous
        </Text>
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={[styles.label, { color: themeColors.text }]}>Prénom</Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.border, color: themeColors.text }]}
            placeholder="Jean"
            placeholderTextColor={themeColors.icon}
            value={formData.firstName}
            onChangeText={(t) => setFormData({ ...formData, firstName: t })}
          />
        </View>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[styles.label, { color: themeColors.text }]}>Nom</Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.border, color: themeColors.text }]}
            placeholder="Dupont"
            placeholderTextColor={themeColors.icon}
            value={formData.lastName}
            onChangeText={(t) => setFormData({ ...formData, lastName: t })}
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.text }]}>Date de naissance</Text>
        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 4 }}>
            <TextInput
              ref={dayRef}
              style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="JJ"
              placeholderTextColor={themeColors.icon}
              value={bd.day}
              onChangeText={handleDayChange}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>
          <View style={{ flex: 1, marginHorizontal: 4 }}>
            <TextInput
              ref={monthRef}
              style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="MM"
              placeholderTextColor={themeColors.icon}
              value={bd.month}
              onChangeText={handleMonthChange}
              onKeyPress={handleMonthKeyPress}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>
          <View style={{ flex: 1.5, marginLeft: 4 }}>
            <TextInput
              ref={yearRef}
              style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="AAAA"
              placeholderTextColor={themeColors.icon}
              value={bd.year}
              onChangeText={handleYearChange}
              onKeyPress={handleYearKeyPress}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
        </View>
        {calculateAge(bd.day, bd.month, bd.year) !== null && (
          <Text style={[styles.ageFeedback, { color: '#f43f5e' }]}>
            Âge calculé : {calculateAge(bd.day, bd.month, bd.year)} ans
          </Text>
        )}
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <SimplePicker
            label="Genre"
            options={[
              { label: 'Homme', value: 'homme' },
              { label: 'Femme', value: 'femme' },
            ]}
            selectedValue={formData.gender}
            onSelect={(v) => setFormData({ ...formData, gender: v })}
            placeholder="Choisir"
            themeColors={themeColors}
          />
        </View>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[styles.label, { color: themeColors.text }]}>Ville</Text>
          <TouchableOpacity
            style={[styles.pickerBtn, { backgroundColor: themeColors.inputBg, borderColor: themeColors.border }]}
            onPress={() => setCityModalVisible(true)}
            activeOpacity={0.7}
          >
            <MapPin color={themeColors.icon} size={16} style={{ marginRight: 6 }} />
            <Text
              style={{ color: formData.city ? themeColors.text : themeColors.icon, fontSize: 16, flex: 1 }}
              numberOfLines={1}
            >
              {formData.city || 'Choisir'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // ── Étape 2 : Informations sociales ──────────────────────────────────
  const renderStep2 = () => (
    <View>
      <View style={styles.stepHeader}>
        <LinearGradient colors={['#3b82f6', '#06b6d4']} style={styles.stepIcon}>
          <Heart color="#ffffff" size={28} />
        </LinearGradient>
        <Text style={[styles.stepTitle, { color: themeColors.text }]}>
          Informations sociales
        </Text>
        <Text style={[styles.stepSubtitle, { color: themeColors.textMuted }]}>
          Aidez-nous à mieux vous connaître
        </Text>
      </View>

      <SimplePicker
        label="Religion"
        options={[
          { label: 'Christianisme', value: 'christianisme' },
          { label: 'Islam', value: 'islam' },
          { label: 'Judaïsme', value: 'judaisme' },
          { label: 'Bouddhisme', value: 'bouddhisme' },
          { label: 'Hindouisme', value: 'hindouisme' },
          { label: 'Autre', value: 'autre' },
          { label: 'Aucune', value: 'aucune' },
        ]}
        selectedValue={formData.religion}
        onSelect={(v) => setFormData({ ...formData, religion: v })}
        placeholder="Sélectionner"
        themeColors={themeColors}
      />

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.text }]}>Profession</Text>
        <TextInput
          style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.border, color: themeColors.text }]}
          placeholder="Votre métier"
          placeholderTextColor={themeColors.icon}
          value={formData.profession}
          onChangeText={(t) => setFormData({ ...formData, profession: t })}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.text }]}>Centres d&apos;intérêt (plusieurs possibles)</Text>
        <View style={styles.tagsContainer}>
          {INTERESTS_LIST.map((interest) => {
            const isSelected = formData.interests.includes(interest);
            return (
              <TouchableOpacity
                key={interest}
                style={[
                  styles.tagBtn,
                  { backgroundColor: themeColors.inputBg, borderColor: themeColors.border },
                  isSelected && { backgroundColor: '#3b82f6', borderColor: '#3b82f6' }
                ]}
                onPress={() => toggleInterest(interest)}
              >
                <Text style={[
                  styles.tagText,
                  { color: themeColors.text },
                  isSelected && { color: '#ffffff' }
                ]}>
                  {interest}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );

  // ── Étape 3 : Informations médicales ─────────────────────────────────
  const renderStep3 = () => (
    <View>
      <View style={styles.stepHeader}>
        <LinearGradient colors={['#8b5cf6', '#6366f1']} style={styles.stepIcon}>
          <Activity color="#ffffff" size={28} />
        </LinearGradient>
        <Text style={[styles.stepTitle, { color: themeColors.text }]}>
          Informations médicales
        </Text>
        <Text style={[styles.stepSubtitle, { color: themeColors.textMuted }]}>
          Pour une compatibilité optimale
        </Text>
      </View>

      <View
        style={[
          styles.infoBox,
          { backgroundColor: themeColors.infoBg, borderColor: themeColors.infoBorder },
        ]}
      >
        <Text style={[styles.infoText, { color: themeColors.infoText }]}>
          Ces informations sont confidentielles et permettent d&apos;évaluer la compatibilité médicale
          avec vos futurs matchs.
        </Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.text }]}>Groupe sanguin</Text>
        <View style={styles.tagsContainer}>
          {BLOOD_TYPES.map((type) => {
            const isSelected = formData.bloodType === type;
            return (
              <TouchableOpacity
                key={type}
                style={[
                  styles.tagBtn,
                  { backgroundColor: themeColors.inputBg, borderColor: themeColors.border },
                  isSelected && { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' }
                ]}
                onPress={() => setFormData({ ...formData, bloodType: type })}
              >
                <Text style={[
                  styles.tagText,
                  { color: themeColors.text },
                  isSelected && { color: '#ffffff' }
                ]}>
                  {type}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.text }]}>Statut drépanocytaire</Text>
        <View style={styles.tagsContainerColumn}>
          {SICKLE_CELL_STATUS.map((status) => {
            const isSelected = formData.sickleCell === status.value;
            return (
              <TouchableOpacity
                key={status.value}
                style={[
                  styles.statusBtn,
                  { backgroundColor: themeColors.inputBg, borderColor: themeColors.border },
                  isSelected && { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' }
                ]}
                onPress={() => setFormData({ ...formData, sickleCell: status.value })}
              >
                <Text style={[
                  styles.statusText,
                  { color: themeColors.text },
                  isSelected && { color: '#ffffff' }
                ]}>
                  {status.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );

  // ── Étape 4 : Photos et bio ──────────────────────────────────────────
  const readyCount = photos.filter((slot) => slot?.status === 'ready').length;
  const uploadingCount = photos.filter((slot) => slot?.status === 'uploading').length;
  const failedCount = photos.filter((slot) => slot?.status === 'error').length;

  const renderStep4 = () => (
    <View>
      <View style={styles.stepHeader}>
        <LinearGradient colors={['#f43f5e', '#ec4899']} style={styles.stepIcon}>
          <Camera color="#ffffff" size={28} />
        </LinearGradient>
        <Text style={[styles.stepTitle, { color: themeColors.text }]}>Photos et bio</Text>
        <Text style={[styles.stepSubtitle, { color: themeColors.textMuted }]}>
          Montrez qui vous êtes
        </Text>
      </View>

      {/* Photo grid */}
      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.text }]}>Photos (jusqu&apos;à 6)</Text>
        <View style={styles.photoGrid}>
          {photos.map((slot, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.photoSlot, { backgroundColor: themeColors.inputBg, borderColor: themeColors.border }]}
              onPress={() => handleSlotPress(index)}
              activeOpacity={0.8}
            >
              {slot ? (
                <>
                  <Image
                    source={{ uri: slot.uri }}
                    style={styles.photoImage}
                    contentFit="cover"
                    cachePolicy={IMAGE_CACHE_POLICY}
                    transition={120}
                  />
                  {slot.status === 'uploading' && (
                    <View style={styles.slotOverlay}>
                      <ActivityIndicator color="#ffffff" />
                    </View>
                  )}
                  {slot.status === 'error' && (
                    <View style={[styles.slotOverlay, styles.slotOverlayError]}>
                      <CircleAlert color="#ffffff" size={22} />
                    </View>
                  )}
                </>
              ) : (
                <Camera color={themeColors.icon} size={24} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.photoFooter}>
          <Text style={[styles.photoStatusText, { color: themeColors.textMuted }]}>
            {readyCount}/{MAX_PHOTOS} photo{readyCount > 1 ? 's' : ''} envoyée{readyCount > 1 ? 's' : ''}
            {uploadingCount > 0 ? ' • envoi en cours…' : ''}
            {failedCount > 0 ? ` • ${failedCount} en erreur` : ''}
          </Text>

          {photos.some((slot) => !slot) && (
            <TouchableOpacity style={styles.multiAddBtn} onPress={handlePickMultiple} activeOpacity={0.8}>
              <Images color="#f43f5e" size={16} />
              <Text style={styles.multiAddText}>Ajouter plusieurs</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Bio */}
      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.text }]}>Bio</Text>
        <TextInput
          style={[
            styles.input,
            styles.textArea,
            { backgroundColor: themeColors.inputBg, borderColor: themeColors.border, color: themeColors.text },
          ]}
          placeholder="Parlez de vous, vos passions, ce que vous recherchez..."
          placeholderTextColor={themeColors.icon}
          value={formData.bio}
          onChangeText={(t) => setFormData({ ...formData, bio: t.slice(0, 500) })}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />
        <Text style={[styles.charCount, { color: themeColors.textMuted }]}>
          {formData.bio.length}/500 caractères
        </Text>
      </View>
    </View>
  );

  const renderStep = () => {
    switch (step) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      case 4:
        return renderStep4();
      default:
        return null;
    }
  };


  // ── Rendu principal ───────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <LinearGradient
          colors={isDark ? ['#111827', '#1f2937'] : ['#fff1f2', '#ffffff', '#eff6ff']}
          style={StyleSheet.absoluteFill}
        />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Progress bar */}
          <View style={styles.progressSection}>
            <View style={styles.progressLabels}>
              <Text style={[styles.progressText, { color: themeColors.textMuted }]}>
                Étape {step} sur {totalSteps}
              </Text>
              <Text style={[styles.progressText, { color: themeColors.textMuted }]}>
                {Math.round((step / totalSteps) * 100)}%
              </Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: isDark ? '#374151' : '#e5e7eb' }]}>
              <LinearGradient
                colors={['#f43f5e', '#ec4899']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${(step / totalSteps) * 100}%` as any }]}
              />
            </View>
          </View>

          {/* Card */}
          <View style={[styles.card, { backgroundColor: themeColors.bgCard }]}>
            {renderStep()}
          </View>

          {/* Navigation */}
          <View style={styles.navRow}>
            {step > 1 && (
              <TouchableOpacity
                style={[styles.navBtnOutline, { borderColor: themeColors.border, flex: 1, marginRight: 12 }]}
                onPress={handleBack}
                activeOpacity={0.7}
              >
                <ChevronLeft color={themeColors.text} size={20} style={{ marginRight: 4 }} />
                <Text style={[styles.navBtnOutlineText, { color: themeColors.text }]}>Retour</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={handleNext}
              activeOpacity={0.8}
              disabled={loading}
            >
              <LinearGradient
                colors={['#f43f5e', '#ec4899']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.navBtnPrimary}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Text style={styles.navBtnPrimaryText}>
                      {step === totalSteps ? 'Terminer' : 'Suivant'}
                    </Text>
                    {step < totalSteps && (
                      <ChevronRight color="#ffffff" size={20} style={{ marginLeft: 4 }} />
                    )}
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Selecteur de ville : popup partagee avec recherche */}
      <CityPickerModal
        visible={cityModalVisible}
        selectedCity={formData.city}
        title="Votre ville"
        placeholder="Rechercher une ville..."
        emptyMessage="Aucune ville trouvée."
        theme={{
          text: themeColors.text,
          textMuted: themeColors.textMuted,
          bgCard: themeColors.bgCard,
          border: themeColors.border,
          inputBg: themeColors.inputBg,
          icon: themeColors.icon,
        }}
        onSelect={(city) => {
          setFormData((prev) => ({ ...prev, city }));
          setCityModalVisible(false);
        }}
        onClose={() => setCityModalVisible(false)}
      />
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 48,
  },

  /* Progress */
  progressSection: { marginBottom: 24 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressText: { fontSize: 14 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },

  /* Card */
  card: {
    borderRadius: 24,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
    marginBottom: 24,
  },

  /* Step header */
  stepHeader: { alignItems: 'center', marginBottom: 28 },
  stepIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  stepSubtitle: { fontSize: 14 },

  /* Inputs */
  inputGroup: { marginBottom: 18 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 8 },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  textArea: {
    height: 120,
    paddingTop: 12,
  },
  charCount: { fontSize: 12, marginTop: 6, textAlign: 'right' },
  row: { flexDirection: 'row' },

  /* Picker */
  pickerBtn: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionsList: {
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 4,
    overflow: 'hidden',
  },
  optionItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  /* Info box */
  infoBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  infoText: { fontSize: 13, lineHeight: 20 },

  /* Tags */
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 14,
    fontWeight: '500',
  },
  tagsContainerColumn: {
    flexDirection: 'column',
    gap: 8,
  },
  statusBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 15,
    fontWeight: '500',
  },

  /* Photo grid */
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  photoSlot: {
    width: '30%',
    aspectRatio: 1,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  slotOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
  },
  slotOverlayError: { backgroundColor: 'rgba(239,68,68,0.55)' },
  photoFooter: { marginTop: 12, gap: 10 },
  photoStatusText: { fontSize: 13 },
  multiAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.4)',
    borderRadius: 20,
    paddingVertical: 10,
  },
  multiAddText: { color: '#f43f5e', fontSize: 14, fontWeight: '600' },

  /* Navigation buttons */
  navRow: { flexDirection: 'row' },
  navBtnOutline: {
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navBtnOutlineText: { fontSize: 16, fontWeight: '600' },
  navBtnPrimary: {
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#f43f5e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  navBtnPrimaryText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  ageFeedback: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    fontStyle: 'italic',
  }
});
