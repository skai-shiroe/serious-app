import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { openLegalPage, type LegalPage } from '@/lib/legal-links';

export default function LegalWebRedirect({ page }: { page: LegalPage }) {
  const router = useRouter();
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;

    void (async () => {
      try {
        await openLegalPage(page);
      } finally {
        if (router.canGoBack()) router.back();
        else router.replace('/');
      }
    })();
  }, [page, router]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <ActivityIndicator color="#E91E63" />
        <Text style={styles.message}>Ouverture de la page Geno…</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  message: { color: '#6b7280', fontSize: 14 },
});
