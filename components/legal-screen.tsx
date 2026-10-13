import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

interface LegalScreenProps {
  title: string;
  updatedAt: string;
  sections: LegalSection[];
}

/**
 * Rendu commun des ecrans legaux (CGU / Politique de confidentialite).
 * Entete custom identique aux ecrans admin/verification : pas de header
 * natif, chaque ecran dessine le sien.
 */
export default function LegalScreen({ title, updatedAt, sections }: LegalScreenProps) {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';

  const themeColors = {
    text: isDark ? '#ffffff' : '#111827',
    textMuted: isDark ? '#9ca3af' : '#6b7280',
    bg: isDark ? '#111827' : '#f9fafb',
    border: isDark ? '#374151' : '#e5e7eb',
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.bg }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        {/* canGoBack() : ouverture via deep link direct, la pile peut etre
            vide — on retombe alors sur la route racine (gate d'auth). */}
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft color={themeColors.text} size={22} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.updatedAt, { color: themeColors.textMuted }]}>
          Dernière mise à jour : {updatedAt}
        </Text>

        {sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={[styles.sectionHeading, { color: themeColors.text }]}>
              {section.heading}
            </Text>
            {section.paragraphs.map((paragraph, i) => (
              <Text
                key={i}
                style={[styles.paragraph, { color: themeColors.textMuted }]}
              >
                {paragraph}
              </Text>
            ))}
          </View>
        ))}

        <Text style={[styles.disclaimer, { color: themeColors.textMuted }]}>
          Document rédigé à titre indicatif pour la mise en conformité des
          stores. Il devra être relu par un conseil juridique avant la mise en
          production définitive.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  content: { padding: 20, paddingBottom: 48 },
  updatedAt: { fontSize: 13, marginBottom: 24, fontStyle: 'italic' },
  section: { marginBottom: 24 },
  sectionHeading: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  paragraph: { fontSize: 14, lineHeight: 22, marginBottom: 8 },
  disclaimer: { fontSize: 12, lineHeight: 18, marginTop: 8, fontStyle: 'italic' },
});