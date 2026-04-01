import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import { View, Text, StyleSheet, ScrollView, useColorScheme } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Zap, BookOpen, Star } from 'lucide-react-native';

export default function CoachingScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const themeColors = {
    text: isDark ? '#ffffff' : '#111827',
    textMuted: isDark ? '#9ca3af' : '#6b7280',
    bg: isDark ? '#111827' : '#f9fafb',
    card: isDark ? '#1f2937' : '#ffffff',
    border: isDark ? '#374151' : '#f3f4f6',
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.bg }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        <View style={styles.header}>
          <Text style={[styles.title, { color: themeColors.text }]}>Coaching</Text>
          <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>
            Maximisez vos chances de rencontres
          </Text>
        </View>

        {/* Conseil du jour */}
        <LinearGradient
          colors={['#f43f5e', '#ec4899']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.tipOfTheDay}
        >
          <View style={styles.tipHeader}>
            <Zap color="#ffffff" size={24} />
            <Text style={styles.tipHeaderText}>Conseil du jour</Text>
          </View>
          <Text style={styles.tipText}>
            Soyez authentique ! Une bio courte qui montre votre humour attire 3x plus de matchs.
          </Text>
        </LinearGradient>

        <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Astuces pour matcher</Text>
        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <View style={styles.cardHeader}>
            <LinearGradient colors={['#8b5cf6', '#6366f1']} style={styles.iconCircle}>
              <Star color="#ffffff" size={20} />
            </LinearGradient>
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>L'art de la première phrase</Text>
          </View>
          <Text style={[styles.cardContent, { color: themeColors.textMuted }]}>
            Oubliez les "Salut ça va ?". Rebondissez plutôt sur un élément d'une de ses photos ou de sa bio pour engager la conversation.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <View style={styles.cardHeader}>
            <LinearGradient colors={['#10b981', '#3b82f6']} style={styles.iconCircle}>
              <BookOpen color="#ffffff" size={20} />
            </LinearGradient>
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>Bien choisir ses photos</Text>
          </View>
          <Text style={[styles.cardContent, { color: themeColors.textMuted }]}>
            Privilégiez une première photo claire de votre visage sans lunettes de soleil. Ajoutez ensuite une ou deux photos en plein air ou qui illustrent vos passions.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  header: {
    marginBottom: 32,
    marginTop: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
  },
  tipOfTheDay: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 32,
    shadowColor: '#f43f5e',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  tipHeaderText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  tipText: {
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 24,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  card: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  cardContent: {
    fontSize: 15,
    lineHeight: 22,
  },
});
