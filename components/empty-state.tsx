import React, { type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/** Accent de l'app (identique aux `themeColors.accent` des ecrans). */
const ACCENT = '#f43f5e';

export type EmptyStateProps = {
  /** Icone affichee dans le cercle teinte (ex. `<Heart color={ACCENT} size={48} />`). */
  icon?: ReactNode;
  title: string;
  message?: string;
  /** Bouton d'action : les deux props sont necessaires pour l'afficher. */
  actionLabel?: string;
  onAction?: () => void;
  /**
   * Etat d'echec (reseau, serveur...) plutot que liste reellement vide :
   * le cercle et le bouton passent en teinte neutre pour ne pas confondre
   * « il n'y a rien » avec « je n'ai pas pu charger ».
   */
  isError?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Etat vide OU en erreur, partage par tous les ecrans.
 *
 * Avant, un echec reseau affichait le meme message qu'une liste vide
 * (« Revenez plus tard 💤 », « Aucun conseil... ») et l'utilisateur n'avait
 * aucun moyen de reessayer. Ici un `isError` affiche un titre explicite et un
 * bouton « Réessayer » relie a l'appel reseau concerne.
 */
export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  isError = false,
  style,
}: EmptyStateProps) {
  const isDark = useColorScheme() === 'dark';

  const textColor = isDark ? '#ffffff' : '#111827';
  const mutedColor = isDark ? '#9ca3af' : '#6b7280';
  const circleColor = isError
    ? isDark
      ? 'rgba(156,163,175,0.15)'
      : 'rgba(107,114,128,0.10)'
    : 'rgba(244,63,94,0.10)';
  const buttonColor = isError ? (isDark ? '#374151' : '#111827') : ACCENT;

  return (
    <View style={[styles.container, style]}>
      {icon ? <View style={[styles.circle, { backgroundColor: circleColor }]}>{icon}</View> : null}

      <Text style={[styles.title, { color: textColor }]}>{title}</Text>

      {message ? <Text style={[styles.message, { color: mutedColor }]}>{message}</Text> : null}

      {actionLabel && onAction ? (
        <TouchableOpacity
          style={[styles.button, { backgroundColor: buttonColor }]}
          onPress={onAction}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // `flexGrow` + `minHeight` : centrage correct aussi bien dans un conteneur
  // flexible (ecran plein) que dans le contenu d'un ScrollView.
  container: {
    flexGrow: 1,
    minHeight: 320,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  circle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  message: { fontSize: 16, textAlign: 'center', marginBottom: 32, lineHeight: 24 },
  button: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 28 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
});
