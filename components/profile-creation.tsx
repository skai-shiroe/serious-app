import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { User, Heart, Activity, Camera, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { decode } from 'base64-arraybuffer';

interface ProfileCreationProps {
  onComplete: () => void;
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
export default function ProfileCreation({ onComplete }: ProfileCreationProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null, null, null, null]);
  const [formData, setFormData] = useState({
    age: '',
    gender: '',
    city: '',
    religion: '',
    profession: '',
    interests: [] as string[],
    bloodType: '',
    sickleCell: '',
    bio: '',
  });

  const handlePickImage = async (index: number) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      const newPhotos = [...photos];
      newPhotos[index] = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setPhotos(newPhotos);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Utilisateur non connecté");

      // Upload photos
      const uploadedUrls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const photoBase64 = photos[i];
        if (photoBase64) {
          const filePath = `${user.id}/${Date.now()}_${i}.jpg`;
          const base64Str = photoBase64.replace(/^data:image\/\w+;base64,/, '');
          
          const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, decode(base64Str), {
              contentType: 'image/jpeg',
            });
            
          if (uploadError) throw uploadError;

          const { data } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);
            
          uploadedUrls.push(data.publicUrl);
        }
      }

      // Record profile
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          age: parseInt(formData.age, 10) || null,
          gender: formData.gender,
          city: formData.city,
          religion: formData.religion,
          profession: formData.profession,
          interests: formData.interests,
          blood_type: formData.bloodType,
          sickle_cell: formData.sickleCell,
          bio: formData.bio,
          photos: uploadedUrls
        });

      if (profileError) throw profileError;

      onComplete();
    } catch (error: any) {
      Alert.alert("Erreur", error.message || "Une erreur est survenue lors de la sauvegarde.");
    } finally {
      setLoading(false);
    }
  };

  const toggleInterest = (interest: string) => {
    setFormData(prev => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter(i => i !== interest)
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
          <Text style={[styles.label, { color: themeColors.text }]}>Âge</Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.border, color: themeColors.text }]}
            placeholder="25"
            placeholderTextColor={themeColors.icon}
            value={formData.age}
            onChangeText={(t) => setFormData({ ...formData, age: t })}
            keyboardType="number-pad"
          />
        </View>
        <View style={{ flex: 1, marginLeft: 8 }}>
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
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.text }]}>Ville</Text>
        <TextInput
          style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.border, color: themeColors.text }]}
          placeholder="Paris, France"
          placeholderTextColor={themeColors.icon}
          value={formData.city}
          onChangeText={(t) => setFormData({ ...formData, city: t })}
        />
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
        <Text style={[styles.label, { color: themeColors.text }]}>Centres d'intérêt (plusieurs possibles)</Text>
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
          Ces informations sont confidentielles et permettent d'évaluer la compatibilité médicale
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
        <Text style={[styles.label, { color: themeColors.text }]}>Photos (jusqu'à 6)</Text>
        <View style={styles.photoGrid}>
          {photos.map((photo, i) => (
            <TouchableOpacity
              key={i}
              style={[
                styles.photoSlot,
                { backgroundColor: themeColors.inputBg, borderColor: themeColors.border, overflow: 'hidden' },
              ]}
              activeOpacity={0.7}
              onPress={() => handlePickImage(i)}
            >
              {photo ? (
                <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} />
              ) : (
                <Camera color={themeColors.icon} size={28} />
              )}
            </TouchableOpacity>
          ))}
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
          style={StyleSheet.absoluteFillObject}
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
});
