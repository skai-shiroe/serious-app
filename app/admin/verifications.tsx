import { supabase } from '@/lib/supabase';
import { getUser } from '@/lib/session';
import { EmptyState } from '@/components/empty-state';
import { IMAGE_CACHE_POLICY, imageSource } from '@/lib/images';
import { Image } from 'expo-image';
import { ArrowLeft, BadgeCheck, FileCheck2, ShieldCheck, WifiOff, X } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

/**
 * File d'attente des verifications (identite / genotype) — reservee aux admins
 * et managers (`profiles.role`).
 *
 * Les documents vivent dans le bucket PRIVE `verifications` : ils ne sont
 * accessibles que par une URL SIGNEE de courte duree, regeneree a chaque
 * ouverture de l'ecran. Aucune image n'est publique.
 *
 * Validation / refus passent par la RPC `review_verification`, qui verifie
 * elle-meme les droits (is_admin) et met a jour `profiles` dans la meme
 * transaction.
 */

type VerificationType = 'identity' | 'genotype';

type VerificationRow = {
  id: string;
  user_id: string;
  type: VerificationType;
  documents: { path: string; label: string }[] | null;
  declared_value: string | null;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  photos: string[] | null;
  sickle_cell: string | null;
};

type ReviewItem = {
  request: VerificationRow;
  profile?: ProfileRow;
  docs: { label: string; url: string | null }[];
};

const BUCKET = 'verifications';
/** Duree de validite d'une URL signee : le temps de lire un dossier. */
const SIGNED_URL_TTL = 300;

export default function AdminVerificationsScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';

  const [roleLoading, setRoleLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [working, setWorking] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null);
  const [rejecting, setRejecting] = useState<ReviewItem | null>(null);
  const [reason, setReason] = useState('');

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

      const { data: me, error: meError } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (meError) throw meError;

      const admin = me?.role === 'admin' || me?.role === 'manager';
      setIsAdmin(admin);
      setRoleLoading(false);

      if (!admin) {
        setLoading(false);
        return;
      }

      const { data: requests, error: requestsError } = await supabase
        .from('verifications')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (requestsError) throw requestsError;

      const rows = (requests || []) as VerificationRow[];
      if (rows.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, city, photos, sickle_cell')
        .in('user_id', userIds);

      const profilesById = new Map<string, ProfileRow>(
        ((profiles || []) as ProfileRow[]).map((row) => [row.user_id, row])
      );

      // URL signees : le bucket est prive, rien n'est accessible sans elles.
      const enriched = await Promise.all(
        rows.map(async (request) => {
          const docs = await Promise.all(
            (request.documents || []).map(async (doc) => {
              const { data } = await supabase.storage
                .from(BUCKET)
                .createSignedUrl(doc.path, SIGNED_URL_TTL);
              return { label: doc.label, url: data?.signedUrl ?? null };
            })
          );
          return { request, profile: profilesById.get(request.user_id), docs };
        })
      );

      setItems(enriched);
    } catch (error: any) {
      console.warn('[Admin] chargement des demandes impossible', error?.message || error);
      setLoadError(
        'Impossible de charger les demandes. Vérifiez votre connexion puis réessayez.'
      );
    } finally {
      setLoading(false);
      setRoleLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  /** Valider ou refuser, puis recharger la file. */
  const review = async (item: ReviewItem, approve: boolean, rejectionReason?: string) => {
    setWorking(item.request.id);
    try {
      const { error } = await supabase.rpc('review_verification', {
        p_id: item.request.id,
        p_approve: approve,
        p_verified_value: approve ? item.request.declared_value : null,
        p_reason: approve ? null : rejectionReason || 'Document non conforme.',
      });

      if (error) throw error;

      await load();
      Alert.alert(
        approve ? 'Demande validée' : 'Demande refusée',
        approve
          ? 'Le badge de certification est mis à jour, et la décision apparaît immédiatement dans le profil de l’utilisateur.'
          : 'La personne voit le motif du refus dans son écran Vérifications.'
      );
    } catch (error: any) {
      Alert.alert('Action impossible', error?.message || 'Réessayez plus tard.');
    } finally {
      setWorking(null);
    }
  };

  const renderItem = (item: ReviewItem) => {
    const { request, profile, docs } = item;
    const isIdentity = request.type === 'identity';
    const busy = working === request.id;
    const fullName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Utilisateur';

    return (
      <View
        key={request.id}
        style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
      >
        <View style={styles.cardHeader}>
          <Image
            source={imageSource(profile?.photos?.[0])}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy={IMAGE_CACHE_POLICY}
            transition={120}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: themeColors.text }]}>{fullName}</Text>
            <Text style={[styles.meta, { color: themeColors.textMuted }]}>
              {profile?.city ? `${profile.city} • ` : ''}
              {new Date(request.created_at).toLocaleDateString('fr-FR')}
            </Text>
          </View>
          <View
            style={[
              styles.typePill,
              {
                backgroundColor: isIdentity
                  ? 'rgba(244,63,94,0.15)'
                  : 'rgba(34,211,238,0.16)',
              },
            ]}
          >
            {isIdentity ? (
              <ShieldCheck color="#f43f5e" size={14} />
            ) : (
              <BadgeCheck color="#22d3ee" size={14} />
            )}
            <Text
              style={[styles.typePillText, { color: isIdentity ? '#f43f5e' : '#22d3ee' }]}
            >
              {isIdentity ? 'Identité' : 'Génotype'}
            </Text>
          </View>
        </View>

        <Text style={[styles.declared, { color: themeColors.textMuted }]}>
          {isIdentity
            ? `Nom déclaré : ${request.declared_value || 'non renseigné'}`
            : `Génotype déclaré : ${request.declared_value || 'non renseigné'} — vérifiez que l’analyse mentionne bien cette valeur.`}
        </Text>

        <View style={styles.docRow}>
          {docs.map((doc, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.doc, { backgroundColor: themeColors.inputBg, borderColor: themeColors.border }]}
              onPress={() => {
                if (doc.url) setPreview({ url: doc.url, label: doc.label });
              }}
              activeOpacity={0.85}
            >
              {doc.url ? (
                <Image
                  source={{ uri: doc.url }}
                  style={styles.docImage}
                  contentFit="cover"
                  cachePolicy={IMAGE_CACHE_POLICY}
                  transition={120}
                />
              ) : (
                <FileCheck2 color={themeColors.textMuted} size={22} />
              )}
              <Text
                style={[styles.docLabel, { color: themeColors.textMuted }]}
                numberOfLines={1}
              >
                {doc.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.rejectBtn, { borderColor: '#ef4444' }]}
            onPress={() => {
              setReason('');
              setRejecting(item);
            }}
            disabled={busy}
            activeOpacity={0.85}
          >
            <X color="#ef4444" size={18} />
            <Text style={styles.rejectText}>Refuser</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.approveBtn}
            onPress={() => {
              void review(item, true);
            }}
            disabled={busy}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <BadgeCheck color="#ffffff" size={18} />
                <Text style={styles.approveText}>Valider</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (roleLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.bg }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={themeColors.accent} />
        </View>
      </SafeAreaView>
    );
  }

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
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Demandes à valider</Text>
        <Text style={[styles.headerCount, { color: themeColors.textMuted }]}>
          {isAdmin && !loading ? items.length : ''}
        </Text>
      </View>

      {!isAdmin ? (
        <EmptyState
          icon={<ShieldCheck color={themeColors.textMuted} size={48} />}
          title="Accès réservé"
          message="Cet écran est réservé aux administrateurs et managers."
          actionLabel="Retour"
          onAction={() => router.back()}
        />
      ) : loading ? (
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
      ) : items.length === 0 ? (
        <EmptyState
          icon={<BadgeCheck color="#10b981" size={48} />}
          title="Aucune demande en attente"
          message="Tout est à jour, revenez plus tard."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {items.map(renderItem)}
        </ScrollView>
      )}

      {/* Apercu plein ecran d'un document (URL signee, jamais publique) */}
      <Modal
        visible={!!preview}
        transparent
        animationType="fade"
        onRequestClose={() => setPreview(null)}
      >
        <View style={styles.previewOverlay}>
          <TouchableOpacity
            style={styles.previewClose}
            onPress={() => setPreview(null)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <X color="#ffffff" size={26} />
          </TouchableOpacity>
          {preview && (
            <>
              <Image
                source={{ uri: preview.url }}
                style={styles.previewImage}
                contentFit="contain"
                transition={120}
              />
              <Text style={styles.previewLabel}>{preview.label}</Text>
            </>
          )}
        </View>
      </Modal>

      {/* Motif de refus (obligatoire) */}
      <Modal
        visible={!!rejecting}
        transparent
        animationType="slide"
        onRequestClose={() => setRejecting(null)}
      >
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheet, { backgroundColor: themeColors.card }]}>
            <Text style={[styles.sheetTitle, { color: themeColors.text }]}>Motif du refus</Text>
            <Text style={[styles.sheetHint, { color: themeColors.textMuted }]}>
              Ce message sera visible par l’utilisateur : restez factuel (document illisible,
              nom différent…).
            </Text>
            <TextInput
              style={[
                styles.reasonInput,
                {
                  backgroundColor: themeColors.inputBg,
                  borderColor: themeColors.border,
                  color: themeColors.text,
                },
              ]}
              placeholder="Ex. Photo du verso illisible."
              placeholderTextColor={themeColors.textMuted}
              value={reason}
              onChangeText={setReason}
              multiline
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={[styles.sheetCancel, { borderColor: themeColors.border }]}
                onPress={() => setRejecting(null)}
                activeOpacity={0.85}
              >
                <Text style={{ color: themeColors.text, fontWeight: '600' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetConfirm, { opacity: reason.trim() ? 1 : 0.5 }]}
                disabled={!reason.trim()}
                activeOpacity={0.85}
                onPress={() => {
                  const item = rejecting;
                  const text = reason.trim();
                  setRejecting(null);
                  if (item) void review(item, false, text);
                }}
              >
                <Text style={styles.sheetConfirmText}>Refuser</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  headerTitle: { fontSize: 17, fontWeight: 'bold' },
  headerCount: { width: 40, textAlign: 'right', fontSize: 15, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, paddingBottom: 48 },

  card: { borderRadius: 20, borderWidth: 1, padding: 18, marginBottom: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(156,163,175,0.2)' },
  name: { fontSize: 16, fontWeight: 'bold' },
  meta: { fontSize: 13, marginTop: 2 },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  typePillText: { fontSize: 12, fontWeight: '700' },
  declared: { fontSize: 13, lineHeight: 19, marginBottom: 12 },

  docRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  doc: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  docImage: { width: '100%', height: '100%' },
  docLabel: { fontSize: 11, paddingVertical: 6, paddingHorizontal: 8, textAlign: 'center' },

  actions: { flexDirection: 'row', gap: 12 },
  rejectBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  rejectText: { color: '#ef4444', fontSize: 15, fontWeight: '700' },
  approveBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#10b981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  approveText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },

  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  previewClose: { position: 'absolute', top: 48, right: 20, zIndex: 10, padding: 8 },
  previewImage: { width: '100%', height: '80%' },
  previewLabel: {
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 24,
  },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingBottom: 32,
  },
  sheetTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  sheetHint: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  reasonInput: {
    minHeight: 90,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  sheetActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  sheetCancel: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetConfirm: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetConfirmText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
});
