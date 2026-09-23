import { useEffect } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

// Route cible du deep link OAuth : seriousapp://auth-callback
// (URL declaree dans Supabase > Authentication > URL Configuration).
// L'echange du code est fait par AuthScreen / openAuthSessionAsync ;
// cet ecran sert de filet de securite et redirige des qu'une session existe.
export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const redirectIfSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && !cancelled) router.replace('/');
    };

    redirectIfSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace('/');
    });

    return () => {
      cancelled = true;
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
