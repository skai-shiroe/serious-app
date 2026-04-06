import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    // Cette page est appelée par le deep link `seriousapp://auth/callback`
    // après une connexion Google OAuth.
    // L'échange du code contre la session est souvent géré par le composant qui a
    // appelé openAuthSessionAsync ou par Supabase automatiquement s'il parse l'URL.
    
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace('/');
      }
    };
    
    checkSession();
    
    // On s'assure également de rediriger si l'état change
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        router.replace('/');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' }}>
      <ActivityIndicator size="large" color="#f43f5e" />
    </View>
  );
}
