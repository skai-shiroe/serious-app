import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform, 
  useColorScheme,
  ScrollView,
  SafeAreaView,
  Alert,
  ActivityIndicator
} from 'react-native';
import { Mail, Phone, Heart, Eye, EyeOff, Chrome } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

interface AuthScreenProps {
  onComplete: () => void;
}

export default function AuthScreen({ onComplete }: AuthScreenProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const handleSubmit = async () => {
    if (!formData.email || !formData.password) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs obligatoires.');
      return;
    }

    if (!isLogin && formData.password !== formData.confirmPassword) {
      Alert.alert('Erreur', 'Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              phone: formData.phone,
            },
          },
        });
        if (error) throw error;
        Alert.alert(
          'Inscription réussie',
          'Un email de confirmation vous a été envoyé. Veuillez vérifier votre boîte de réception.'
        );
      }
      onComplete();
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    try {
      const redirectUrl = AuthSession.makeRedirectUri({
        scheme: 'seriousapp',
        path: 'auth/callback',
      });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

        if (result.type === 'success' && result.url) {
          const url = new URL(result.url);
          const code = url.searchParams.get('code');

          if (code) {
            const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
            if (sessionError) throw sessionError;
            onComplete();
          }
        }
      }
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Échec de la connexion Google.');
    } finally {
      setLoading(false);
    }
  };

  

  const handleForgotPassword = async () => {
    if (!formData.email) {
      Alert.alert('Erreur', 'Veuillez entrer votre adresse email.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(formData.email);
      if (error) throw error;
      Alert.alert(
        'Email envoyé',
        'Un lien de réinitialisation vous a été envoyé par email.'
      );
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  const themeColors = {
    text: isDark ? '#ffffff' : '#111827',
    textMuted: isDark ? '#d1d5db' : '#4b5563',
    bgCard: isDark ? '#1f2937' : '#ffffff',
    border: isDark ? '#374151' : '#e5e7eb',
    inputBg: isDark ? '#374151' : '#ffffff',
    icon: '#9ca3af',
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <LinearGradient
          colors={isDark ? ['#111827', '#1f2937'] : ['#fff1f2', '#ffffff', '#eff6ff']}
          style={StyleSheet.absoluteFillObject}
        />
        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          
          {/* Logo Section */}
          <View style={styles.headerContainer}>
            <LinearGradient
              colors={['#f43f5e', '#ec4899']}
              style={styles.logoCircle}
            >
              <Heart color="#ffffff" size={32} fill="#ffffff" />
            </LinearGradient>
            <Text style={[styles.title, { color: themeColors.text }]}>
              Love<Text style={styles.titleHighlight}>+</Text>
            </Text>
            <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>
              {isLogin ? 'Bienvenue de retour !' : 'Créez votre compte'}
            </Text>
          </View>

          {/* Form Card */}
          <View style={[styles.card, { backgroundColor: themeColors.bgCard }]}>
            
            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text }]}>Email</Text>
              <View style={styles.inputWrapper}>
                <Mail color={themeColors.icon} size={20} style={styles.inputIcon} />
                <TextInput
                  style={[
                    styles.input, 
                    { backgroundColor: themeColors.inputBg, borderColor: themeColors.border, color: themeColors.text, paddingLeft: 40 }
                  ]}
                  placeholder="votre@email.com"
                  placeholderTextColor={themeColors.icon}
                  value={formData.email}
                  onChangeText={(text) => setFormData({ ...formData, email: text })}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Phone (Signup Only) */}
            {!isLogin && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: themeColors.text }]}>Téléphone</Text>
                <View style={styles.inputWrapper}>
                  <Phone color={themeColors.icon} size={20} style={styles.inputIcon} />
                  <TextInput
                    style={[
                      styles.input, 
                      { backgroundColor: themeColors.inputBg, borderColor: themeColors.border, color: themeColors.text, paddingLeft: 40 }
                    ]}
                    placeholder="+33 6 12 34 56 78"
                    placeholderTextColor={themeColors.icon}
                    value={formData.phone}
                    onChangeText={(text) => setFormData({ ...formData, phone: text })}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>
            )}

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text }]}>Mot de passe</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[
                    styles.input, 
                    { backgroundColor: themeColors.inputBg, borderColor: themeColors.border, color: themeColors.text, paddingRight: 40 }
                  ]}
                  placeholder="••••••••"
                  placeholderTextColor={themeColors.icon}
                  value={formData.password}
                  onChangeText={(text) => setFormData({ ...formData, password: text })}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity 
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff color={themeColors.icon} size={20} />
                  ) : (
                    <Eye color={themeColors.icon} size={20} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Confirm Password (Signup Only) */}
            {!isLogin && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: themeColors.text }]}>Confirmer le mot de passe</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={[
                      styles.input, 
                      { backgroundColor: themeColors.inputBg, borderColor: themeColors.border, color: themeColors.text }
                    ]}
                    placeholder="••••••••"
                    placeholderTextColor={themeColors.icon}
                    value={formData.confirmPassword}
                    onChangeText={(text) => setFormData({ ...formData, confirmPassword: text })}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>
            )}

            {/* Forgot Password */}
            {isLogin && (
              <TouchableOpacity style={styles.forgotBtn} onPress={handleForgotPassword}>
                <Text style={styles.forgotText}>Mot de passe oublié ?</Text>
              </TouchableOpacity>
            )}

            {/* Submit Button */}
            <TouchableOpacity onPress={handleSubmit} activeOpacity={0.8} style={styles.submitContainer} disabled={loading}>
              <LinearGradient
                colors={['#f43f5e', '#ec4899']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitBtn}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {isLogin ? 'Se connecter' : "S'inscrire"}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
              <View style={[styles.dividerBadge, { backgroundColor: themeColors.bgCard }]}>
                <Text style={[styles.dividerText, { color: themeColors.textMuted }]}>
                  ou continuer avec
                </Text>
              </View>
            </View>

            {/* Social Login */}
            <TouchableOpacity 
              style={[styles.socialBtn, { borderColor: themeColors.border }]}
              activeOpacity={0.7}
              onPress={handleGoogleAuth}
              disabled={loading}
            >
              <Chrome color={themeColors.text} size={20} style={{ marginRight: 8 }} />
              <Text style={[styles.socialBtnText, { color: themeColors.text }]}>Google</Text>
            </TouchableOpacity>

            {/* Toggle Login/Signup */}
            <View style={styles.toggleContainer}>
              <Text style={[styles.toggleText, { color: themeColors.textMuted }]}>
                {isLogin ? "Pas encore de compte ?" : "Déjà inscrit ?"}
              </Text>
              <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={styles.toggleBtn}>
                <Text style={styles.toggleLink}>
                  {isLogin ? " S'inscrire" : " Se connecter"}
                </Text>
              </TouchableOpacity>
            </View>

          </View>

          {/* Terms */}
          <Text style={styles.termsText}>
            En continuant, vous acceptez nos{' '}
            <Text style={styles.termsLink}>Conditions d'utilisation</Text>
            {' '}et notre{' '}
            <Text style={styles.termsLink}>Politique de confidentialité</Text>
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 48,
    justifyContent: 'center',
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#f43f5e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  titleHighlight: {
    color: '#f43f5e',
  },
  subtitle: {
    fontSize: 16,
    marginTop: 8,
  },
  card: {
    borderRadius: 24,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  inputWrapper: {
    justifyContent: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: 12,
    zIndex: 1,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  eyeBtn: {
    position: 'absolute',
    right: 0,
    height: '100%',
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotText: {
    color: '#f43f5e',
    fontSize: 14,
    fontWeight: '500',
  },
  submitContainer: {
    shadowColor: '#f43f5e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    marginTop: 8,
  },
  submitBtn: {
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  dividerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 24,
    position: 'relative',
  },
  dividerLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
  },
  dividerBadge: {
    paddingHorizontal: 16,
  },
  dividerText: {
    fontSize: 14,
  },
  socialBtn: {
    flexDirection: 'row',
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  socialBtnText: {
    fontSize: 16,
    fontWeight: '500',
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleBtn: {
    paddingVertical: 4,
  },
  toggleText: {
    fontSize: 14,
  },
  toggleLink: {
    color: '#f43f5e',
    fontSize: 14,
    fontWeight: '500',
  },
  termsText: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 24,
    lineHeight: 18,
  },
  termsLink: {
    color: '#f43f5e',
  },
});
