import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, useColorScheme } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import ProfileCreation from '@/components/profile-creation';

export default function EditProfileScreen() {
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState<any>(null);
  const router = useRouter();
  const colorScheme = useColorScheme();

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.back();
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setProfileData(data);
    } catch (error) {
      console.log('Error fetching profile for edit', error);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colorScheme === 'dark' ? '#111827' : '#f9fafb' }]}>
        <ActivityIndicator size="large" color="#f43f5e" />
      </View>
    );
  }

  return (
    <ProfileCreation 
      initialData={profileData} 
      onComplete={() => {
        router.back(); // Retourne au profil après enregistrement
      }} 
    />
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
