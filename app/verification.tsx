import { supabase } from '@/lib/supabase';
import { getUser } from '@/lib/session';
import { EmptyState } from '@/components/empty-state';
import { decode } from 'base64-arraybuffer';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, BadgeCheck, Camera, CircleAlert, Clock, ImagePlus, ShieldCheck, WifiOff } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, useColorScheme, View, type AlertButton } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

/**
 * Verification d'identite et de genotype.
 *
 * Les documents partent dans un bucket PRIVE (`verifications`) : jamais d'URL
 * publique, seul le proprietaire et les admins peuvent les lire (RLS) et
 * l'admin les consulte via une URL signee de courte duree.
 *
 * L'utilisateur ne peut pas s'auto-valider : aucune policy UPDATE ni DELETE ne
 * lui est ouverte sur `verifications`. Apres un refus, il renvoie une NOUVELLE
 * demande (l'historique et le motif restent consultables).
 */

type VerificationType = 'identity' | 'genotype';
type VerificationStatus = 'pending' | 'approved' | 'rejected';

type VerificationRequest = {
  id: string;
  type: VerificationType;
  status: VerificationStatus;
  documents: { path: string; label: string }[] | null;
  declared_value: string | null;
  verified_value: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
};

type DocSlot = { uri: string; path?: string; status: 'uploading' | 'ready' | 'error' };

const BUCKET = 'verifications';
/** Qualite demandee pour un document : lisible, mais raisonnable a envoyer. */
const DOC_QUALITY = 0.7;

const REQUIREMENTS: Record<VerificationType, string[]> = {
  identity: ['Recto de la pièce', 'Verso de la pièce'],
  genotype: ['Analyse de laboratoire'],
};

export default function VerificationScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [requests, setRequests] = useState<Partial<Record<VerificationType, VerificationRequest>>>({});
  const [slots, setSlots] = useState<Record<VerificationType, (DocSlot | null)[]>>({
    identity: [null, null],
    genotype: [null],
  });
  const [busy, setBusy] = useState<VerificationType | null>(null);

  const themeColors = {
    text: isDark ? '#ffffff' : '#111827',
    textMuted: isDark ? '#9ca3af' : '#6b7280',
    bg: isDark ? '#111827' : '#f9fafb',
    card: isDark ? '#1f2937' : '#ffffff',
    border: isDark ? '#374151' : '#e5e7eb',
    inputBg: isDark ? '#374151' : '#f3f4f6',
    accent: '#f43f5e',
  };

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const user = await getUser();
      if (!user) return;

      const [profileRes, requestsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('first_name, last_name, sickle_cell, identity_verified, genotype_verified')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('verifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ]);

      if (profileRes.error) throw profileRes.error;
      if (requestsRes.error) throw requestsRes.error;

      setProfile(profileRes.data);

      // La plus recente par type : c'est elle qui donne le statut affiche.
      const latest: Partial<Record<VerificationType, VerificationRequest>> = {};
      (requestsRes.data || []).forEach((row: VerificationRequest) => {
        if (!latest[row.type]) latest[row.type] = row;
      });
      setRequests(latest);

      // Accuse de lecture : les decisions non vues le sont desormais (le badge
      // « Nouveau » du profil disparait au retour sur cet ecran).
      const hasUnseen = (requestsRes.data || []).some(
        (row: any) => row.reviewed_at && !row.user_seen_at
      );
      if (hasUnseen) {
        await supabase.rpc('mark_verifications_seen');
      }
    } catch (error: any) {
      console.warn('[Verification] chargement impossible', error?.message || error);
      setLoadError(
        'Impossible de charger vos vérifications. Vérifiez votre connexion puis réessayez.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const setSlot = (type: VerificationType, index: number, value: DocSlot | null) => {
    setSlots((prev) => {
      const next = { ...prev, [type]: [...prev[type]] };
      next[type][index] = value;
      return next;
    });
  };

  /** Envoi immediat : le base64 est libere des que l'upload est termine. */
  const uploadDoc = async (
    type: VerificationType,
    index: number,
    localUri: string,
    base64: string
  ) => {
    setSlot(type, index, { uri: localUri, status: 'uploading' });

    try {
      const user = await getUser();
      if (!user) throw new Error('Utilisateur non connecté');

      const path = `${user.id}/${type}/${Date.now()}_${index}.jpg`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, decode(base64), { contentType: 'image/jpeg' });

      if (error) throw error;

      setSlot(type, index, { uri: localUri, path, status: 'ready' });
    } catch (error: any) {
      console.warn('[Verification] envoi du document impossible', error?.message || error);
      setSlot(type, index, { uri: localUri, status: 'error' });
      Alert.alert('Envoi impossible', "Le document n'a pas pu être envoyé. Réessayez.");
    }
  };

  const pickDoc = async (type: VerificationType, index: number, fromCamera: boolean) => {
    try {
      if (fromCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            'Caméra refusée',
            'Autorisez la caméra dans les réglages du téléphone, ou choisissez une photo existante.'
          );
          return;
        }
      }

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: DOC_QUALITY, base64: true })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: DOC_QUALITY,
            base64: true,
          });

      const asset = result.assets?.[0];
      if (result.canceled || !asset?.base64) return;

      await uploadDoc(type, index, asset.uri, asset.base64);
    } catch (error: any) {
      Alert.alert('Impossible', error?.message || 'Erreur inattendue.');
    }
  };

  const openSlot = (type: VerificationType, index: number) => {
    const slot = slots[type][index];

    if (slot?.status === 'uploading') return;

    const label = REQUIREMENTS[type][index];
    const actions: AlertButton[] = [
      {
        text: 'Prendre une photo',
        onPress: () => {
          void pickDoc(type, index, true);
        },
      },
      {
        text: 'Choisir une photo',
        onPress: () => {
          void pickDoc(type, index, false);
        },
      },
    ];

    if (slot) {
      actions.push({
        text: 'Supprimer',
        onPress: () => setSlot(type, index, null),
      });
    }

    Alert.alert(label, 'Ajoutez une photo nette et lisible.', actions);
  };

  const submit = async (type: VerificationType) => {
    const filled = slots[type];

    if (filled.some((slot) => !slot || slot.status !== 'ready')) {
      Alert.alert('Pièces manquantes', 'Ajoutez tous les documents demandés avant d’envoyer.');
      return;
    }

    setBusy(type);
    try {
      const user = await getUser();
      if (!user) throw new Error('Utilisateur non connecté');

      const documents = filled.map((slot, index) => ({
        path: slot!.path!,
        label: REQUIREMENTS[type][index],
      }));

      // Ce que l'utilisateur affirme : le nom de sa pièce, ou le génotype déclaré.
      const declared =
        type === 'genotype'
          ? profile?.sickle_cell || null
          : [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || null;

      const { error } = await supabase.from('verifications').insert({
        user_id: user.id,
        type,
        status: 'pending',
        documents,
        declared_value: declared,
      });

      if (error) throw error;

      setSlots((prev) => ({ ...prev, [type]: prev[type].map(() => null) }));
      await load();
      Alert.alert('Demande envoyée', 'Vos documents sont en relecture. Merci !');
    } catch (error: any) {
      Alert.alert('Envoi impossible', error?.message || 'Réessayez plus tard.');
    } finally {
      setBusy(null);
    }
  };

  /** Statut affiche : libelle, couleur et icone. */
  const statusInfo = (request?: VerificationRequest) => {
    switch (request?.status) {
      case 'pending':
        return { label: 'En relecture', color: '#f59e0b', Icon: Clock };
      case 'approved':
        return { label: 'Vérifiée', color: '#10b981', Icon: BadgeCheck };
      case 'rejected':
        return { label: 'Refusée', color: '#ef4444', Icon: CircleAlert };
      default:
        return { label: 'À faire', color: themeColors.textMuted, Icon: Camera };
    }
  };

  const renderCard = (type: VerificationType) => {
    const request = requests[type];
    const isPending = request?.status === 'pending';
    const isApproved = request?.status === 'approved';
    const { label: statusLabel, color: statusColor, Icon: StatusIcon } = statusInfo(request);
    const canSubmit = !isPending && !isApproved;
    const filled = slots[type];

    const title = type === 'identity' ? 'Pièce d’identité' : 'Génotype';
    const subtitle =
      type === 'identity'
        ? 'Comparez votre nom à celui de votre pièce (CNIE, passeport…).'
        : 'Joignez votre analyse de laboratoire (électrophorèse de l’hémoglobine).';

    return (
      <View
        key={type}
        style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
      >
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.cardIcon,
              {
                backgroundColor:
                  type === 'identity' ? 'rgba(244,63,94,0.12)' : 'rgba(34,211,238,0.14)',
              },
            ]}
          >
            {type === 'identity' ? (
              <ShieldCheck color={themeColors.accent} size={22} />
            ) : (
              <BadgeCheck color="#22d3ee" size={22} />
            )}
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>{title}</Text>
            <Text style={[styles.cardSubtitle, { color: themeColors.textMuted }]}>
              {subtitle}
            </Text>
          </View>
        </View>

        <View style={[styles.pill, { borderColor: statusColor }]}>
          <StatusIcon color={statusColor} size={14} />
          <Text style={[styles.pillText, { color: statusColor }]}>{statusLabel}</Text>
        </View>

        {type === 'genotype' && (
          <Text style={[styles.declared, { color: themeColors.textMuted }]}>
            Génotype déclaré : {profile?.sickle_cell || 'non renseigné'}
          </Text>
        )}

        {isPending && (
          <Text style={[styles.note, { color: themeColors.textMuted }]}>
            Envoyé le {new Date(request!.created_at).toLocaleDateString('fr-FR')} — en relecture par
            notre équipe.
          </Text>
        )}

        {isApproved && (
          <Text style={[styles.note, { color: '#10b981' }]}>
            Vérifié{request?.verified_value ? ` : ${request.verified_value}` : ''}
            {request?.reviewed_at
              ? ` le ${new Date(request.reviewed_at).toLocaleDateString('fr-FR')}`
              : ''}
            .
          </Text>
        )}

        {request?.status === 'rejected' && (
          <View style={[styles.rejectBox, { borderColor: 'rgba(239,68,68,0.35)', backgroundColor: 'rgba(239,68,68,0.08)' }]}>
            <Text style={[styles.rejectTitle, { color: '#ef4444' }]}>Demande refusée</Text>
            <Text style={[styles.rejectReason, { color: themeColors.text }]}>
              {request.rejection_reason || 'Document illisible ou non conforme.'}
            </Text>
          </View>
        )}

        {canSubmit && (
          <>
            <View style={styles.slotRow}>
              {REQUIREMENTS[type].map((slotLabel, index) => {
                const slot = filled[index];
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.slot,
                      { backgroundColor: themeColors.inputBg, borderColor: themeColors.border },
                    ]}
                    onPress={() => openSlot(type, index)}
                    activeOpacity={0.8}
                  >
                    {slot ? (
                      <>
                        <Image
                          source={{ uri: slot.uri }}
                          style={styles.slotImage}
                          contentFit="cover"
                          transition={120}
                        />
                        {slot.status === 'uploading' && (
                          <View style={styles.slotOverlay}>
                            <ActivityIndicator color="#ffffff" />
                          </View>
                        )}
                        {slot.status === 'error' && (
                          <View style={[styles.slotOverlay, styles.slotOverlayError]}>
                            <CircleAlert color="#ffffff" size={20} />
                          </View>
                        )}
                      </>
                    ) : (
                      <>
                        <ImagePlus color={themeColors.textMuted} size={22} />
                        <Text style={[styles.slotLabel, { color: themeColors.textMuted }]}>
                          {slotLabel}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={() => submit(type)}
              disabled={busy === type}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#f43f5e', '#ec4899']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitGradient}
              >
                {busy === type ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.submitText}>Envoyer pour vérification</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.bg }]}>
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft color={themeColors.text} size={22} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Vérifications</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={themeColors.accent} />
        </View>
      ) : loadError ? (
        <EmptyState
          isError
          icon={<WifiOff color={themeColors.textMuted} size={48} />}
          title="Chargement impossible"
          message={loadError}
          actionLabel="Réessayer"
          onAction={() => {
            setLoading(true);
            load();
          }}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.intro, { color: themeColors.textMuted }]}>
            Un profil vérifié rassure les autres membres. Vos documents restent privés : seul notre
            équipe peut les consulter, et ils sont supprimés après la décision.
          </Text>

          {renderCard('identity')}
          {renderCard('genotype')}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, paddingBottom: 48 },
  intro: { fontSize: 14, lineHeight: 21, marginBottom: 20 },

  card: { borderRadius: 20, borderWidth: 1, padding: 20, marginBottom: 18 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  cardIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 17, fontWeight: 'bold' },
  cardSubtitle: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 12,
  },
  pillText: { fontSize: 13, fontWeight: '700' },
  declared: { fontSize: 13, marginBottom: 12 },
  note: { fontSize: 13, lineHeight: 19, marginBottom: 12 },

  rejectBox: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 14 },
  rejectTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  rejectReason: { fontSize: 14, lineHeight: 20 },

  slotRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  slot: {
    flex: 1,
    aspectRatio: 4 / 3,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
  },
  slotImage: { width: '100%', height: '100%', borderRadius: 12 },
  slotOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12,
  },
  slotOverlayError: { backgroundColor: 'rgba(239,68,68,0.55)' },
  slotLabel: { fontSize: 12, textAlign: 'center', paddingHorizontal: 8 },

  submitBtn: { borderRadius: 26, overflow: 'hidden' },
  submitGradient: { height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  submitText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
});
