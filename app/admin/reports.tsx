import { supabase } from '@/lib/supabase';
import { getUser } from '@/lib/session';
import { reportReasonLabel } from '@/lib/moderation';
import { EmptyState } from '@/components/empty-state';
import { IMAGE_CACHE_POLICY, imageSource } from '@/lib/images';
import { Image } from 'expo-image';
import { ArrowLeft, Flag, ShieldCheck, WifiOff, Eye, Check, X } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

/**
 * File des signalements — reservee aux admins et managers (`profiles.role`).
 *
 * Un signalement n'empeche rien en soi : c'est la file de travail de la
 * moderation. Statuts (table user_reports) :
 *  - pending   : a traiter ;
 *  - reviewed  : examine, conserve pour l'audit ;
 *  - dismissed : classe sans suite.
 * Seul un admin peut changer le statut (policy RLS reports_admin_update).
 */

type ReportStatus = 'pending' | 'reviewed' | 'dismissed';

type ReportRow = {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  created_at: string;
};

type ProfileBrief = {
  user_id: string;
  first_name: string | null;
  city: string | null;
  photos: string[] | null;
};

type ReportItem = {
  report: ReportRow;
  reported?: ProfileBrief;
  /** Nombre total de signalements contre ce profil dans la file. */
  reportCount: number;
};

type Filter = 'pending' | 'reviewed' | 'dismissed' | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'pending', label: 'En attente' },
  { value: 'reviewed', label: 'Traités' },
  { value: 'dismissed', label: 'Classés' },
  { value: 'all', label: 'Tous' },
];

const STATUS_LABEL: Record<ReportStatus, string> = {
  pending: 'En attente',
  reviewed: 'Traité',
  dismissed: 'Classé sans suite',
};

const STATUS_COLOR: Record<ReportStatus, string> = {
  pending: '#f59e0b',
  reviewed: '#10b981',
  dismissed: '#9ca3af',
};

export default function AdminReportsScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';

  const [roleLoading, setRoleLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [items, setItems] = useState<ReportItem[]>([]);
  const [filter, setFilter] = useState<Filter>('pending');
  const [working, setWorking] = useState<string | null>(null);

  const themeColors = {
    text: isDark ? '#ffffff' : '#111827',
    textMuted: isDark ? '#9ca3af' : '#6b7280',
    bg: isDark ? '#111827' : '#f9fafb',
    card: isDark ? '#1f2937' : '#ffffff',
    border: isDark ? '#374151' : '#e5e7eb',
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

      const { data: reports, error: reportsError } = await supabase
        .from('user_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (reportsError) throw reportsError;

      const rows = (reports || []) as ReportRow[];
      if (rows.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const userIds = Array.from(
        new Set(rows.flatMap((row) => [row.reporter_id, row.reported_user_id]))
      );
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, first_name, city, photos')
        .in('user_id', userIds);

      const profilesById = new Map<string, ProfileBrief>(
        ((profiles || []) as ProfileBrief[]).map((row) => [row.user_id, row])
      );

      // Nombre de signalements par profil signale (contexte pour l'admin).
      const counts = new Map<string, number>();
      rows.forEach((row) => {
        counts.set(row.reported_user_id, (counts.get(row.reported_user_id) || 0) + 1);
      });

      setItems(
        rows.map((report) => ({
          report,
          reported: profilesById.get(report.reported_user_id),
          reportCount: counts.get(report.reported_user_id) || 1,
        }))
      );
    } catch {
      setLoadError(
        'Impossible de charger les signalements. Vérifiez votre connexion puis réessayez.'
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

  /** Fait avancer le statut d'un signalement (policy : admin uniquement). */
  const setStatus = async (item: ReportItem, status: ReportStatus) => {
    setWorking(item.report.id);
    try {
      const user = await getUser();
      const { error } = await supabase
        .from('user_reports')
        .update({
          status,
          reviewer_id: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', item.report.id);
      if (error) throw error;
      await load();
    } catch (error: any) {
      Alert.alert('Action impossible', error?.message || 'Réessayez plus tard.');
    } finally {
      setWorking(null);
    }
  };

  const filtered = items.filter(
    (item) => filter === 'all' || item.report.status === filter
  );
  const pendingCount = items.filter((item) => item.report.status === 'pending').length;

  const renderItem = (item: ReportItem) => {
    const { report, reported, reportCount } = item;
    const busy = working === report.id;
    const name = reported?.first_name || 'Utilisateur';
    const statusColor = STATUS_COLOR[report.status];

    return (
      <View
        key={report.id}
        style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
      >
        <View style={styles.cardHeader}>
          <Image
            source={imageSource(reported?.photos?.[0])}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy={IMAGE_CACHE_POLICY}
            transition={120}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: themeColors.text }]}>{name}</Text>
            <Text style={[styles.meta, { color: themeColors.textMuted }]}>
              {reported?.city ? `${reported.city} • ` : ''}
              {new Date(report.created_at).toLocaleDateString('fr-FR')}
              {reportCount > 1 ? ` • ${reportCount} signalements` : ''}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}22` }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {STATUS_LABEL[report.status]}
            </Text>
          </View>
        </View>

        <View style={[styles.reasonRow, { borderTopColor: themeColors.border }]}>
          <Flag color={themeColors.accent} size={16} />
          <Text style={[styles.reasonText, { color: themeColors.text }]}>
            {reportReasonLabel(report.reason)}
          </Text>
        </View>

        {report.details ? (
          <Text style={[styles.details, { color: themeColors.textMuted }]}>{report.details}</Text>
        ) : null}

        <View style={styles.actions}>
          {report.status === 'pending' ? (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: themeColors.border }]}
                onPress={() => {
                  void setStatus(item, 'dismissed');
                }}
                disabled={busy}
                activeOpacity={0.85}
              >
                <X color={themeColors.textMuted} size={18} />
                <Text style={[styles.actionText, { color: themeColors.textMuted }]}>Classer sans suite</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: themeColors.accent, borderColor: themeColors.accent }]}
                onPress={() => {
                  void setStatus(item, 'reviewed');
                }}
                disabled={busy}
                activeOpacity={0.85}
              >
                {busy ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Eye color="#ffffff" size={18} />
                    <Text style={[styles.actionText, { color: '#ffffff' }]}>Marquer traité</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: themeColors.border }]}
              onPress={() => {
                void setStatus(item, 'pending');
              }}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Check color={themeColors.textMuted} size={18} />
              <Text style={[styles.actionText, { color: themeColors.textMuted }]}>Remettre en attente</Text>
            </TouchableOpacity>
          )}
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
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Signalements</Text>
        <Text style={[styles.headerCount, { color: themeColors.textMuted }]}>
          {isAdmin && !loading ? pendingCount : ''}
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
          icon={<Flag color="#10b981" size={48} />}
          title="Aucun signalement"
          message="Rien à traiter, revenez plus tard."
        />
      ) : (
        <>
          {/* Filtres par statut */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
          >
            {FILTERS.map((f) => {
              const active = filter === f.value;
              return (
                <TouchableOpacity
                  key={f.value}
                  activeOpacity={0.8}
                  onPress={() => setFilter(f.value)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? themeColors.accent : themeColors.card,
                      borderColor: active ? themeColors.accent : themeColors.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.chipText, { color: active ? '#ffffff' : themeColors.textMuted }]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {filtered.length === 0 ? (
              <EmptyState
                icon={<Flag color="#10b981" size={48} />}
                title="Rien ici"
                message="Aucun signalement dans cette catégorie."
              />
            ) : (
              filtered.map(renderItem)
            )}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4, marginRight: 12 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: 'bold' },
  headerCount: { fontSize: 14, fontWeight: '600' },
  filters: { paddingHorizontal: 16, paddingTop: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e5e7eb' },
  name: { fontSize: 16, fontWeight: 'bold' },
  meta: { fontSize: 12, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: 'bold' },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  reasonText: { fontSize: 14, fontWeight: '600', flex: 1 },
  details: { fontSize: 13, lineHeight: 19, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionText: { fontSize: 13, fontWeight: '600' },
});



