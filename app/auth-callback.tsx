import { useEffect } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { completeAuthFromUrl } from '@/lib/auth-url';

// Route cible du deep link OAuth : seriousapp://auth-callback
// (URL declaree dans Supabase > Authentication > URL Configuration).
// Le traitement de l'URL (code PKCE ou tokens du flow implicite) est fait
// par lib/auth-url.ts, utilise ici ET dans AuthScreen : les deux peuvent
// recevoir l'URL, le garde-fou y evite tout double traitement.
export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const redirectIfSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && !cancelled) router.replace('/');
    };

    const handleUrl = async (url: string | null) => {
      await completeAuthFromUrl(url);
      if (cancelled) return;
      await redirectIfSession();
    };

    Linking.getInitialURL().then(handleUrl).catch(() => {});

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace('/');
    });

    return () => {
      cancelled = true;
      subscription.remove();
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' }}>
      <ActivityIndicator size="large" color="#f43f5e" />
      <Text style={{ marginTop: 16, color: '#6b7280' }}>Connexion en cours...</Text>
    </View>
  );
}
