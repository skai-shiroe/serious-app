import { BadgeCheck } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** Couleur des badges de confiance : lisible sur photo comme sur fond clair. */
export const VERIFIED_COLOR = '#22d3ee';

/** Icone « identite verifiee », a poser juste apres un prenom. */
export function IdentityVerifiedIcon({
  size = 16,
  color = VERIFIED_COLOR,
}: {
  size?: number;
  color?: string;
}) {
  return <BadgeCheck color={color} size={size} />;
}

/**
 * Pastille « genotype verifie », qui affiche le genotype confirme par le
 * document medical (AA / AS / SS).
 *
 * `variant="onPhoto"` pour la carte du deck (fond translucide, texte blanc).
 */
export function GenotypeVerifiedBadge({
  genotype,
  variant = 'inline',
}: {
  genotype?: string | null;
  variant?: 'inline' | 'onPhoto';
}) {
  if (!genotype) return null;

  const onPhoto = variant === 'onPhoto';

  return (
    <View style={[styles.badge, onPhoto ? styles.badgeOnPhoto : styles.badgeInline]}>
      <BadgeCheck color={onPhoto ? '#ffffff' : VERIFIED_COLOR} size={12} />
      <Text style={[styles.text, { color: onPhoto ? '#ffffff' : VERIFIED_COLOR }]}>
        Génotype {genotype} vérifié
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeOnPhoto: { backgroundColor: 'rgba(34,211,238,0.35)' },
  badgeInline: { backgroundColor: 'rgba(34,211,238,0.15)' },
  text: { fontSize: 12, fontWeight: '700' },
});
