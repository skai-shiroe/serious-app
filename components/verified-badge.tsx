import { BadgeCheck, ShieldCheck } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, useColorScheme, View, type StyleProp, type ViewStyle } from 'react-native';

/** Couleur des badges « par etape » (identite, genotype). */
export const VERIFIED_COLOR = '#22d3ee';

/**
 * Certification complete : identite ET genotype ont ete valides.
 * C'est le signal de confiance le plus fort de l'app.
 */
export function isFullyVerified(
  profile?: { identity_verified?: boolean | null; genotype_verified?: boolean | null } | null
): boolean {
  return !!profile?.identity_verified && !!profile?.genotype_verified;
}

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

/** Icone de certification complete (ambre), pour les listes compactes. */
export function CertifiedIcon({ size = 16 }: { size?: number }) {
  const isDark = useColorScheme() === 'dark';
  return <ShieldCheck color={isDark ? '#fbbf24' : '#b45309'} size={size} />;
}

/**
 * Pastille « genotype verifie », avec le genotype confirme par le document
 * medical (AA / AS / SS).
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
    <View style={[styles.badge, onPhoto ? styles.genotypeOnPhoto : styles.cyanInline]}>
      <BadgeCheck color={onPhoto ? '#ffffff' : VERIFIED_COLOR} size={12} />
      <Text style={[styles.text, { color: onPhoto ? '#ffffff' : VERIFIED_COLOR }]}>
        Génotype {genotype} vérifié
      </Text>
    </View>
  );
}

/**
 * Pastille ronde de certification, a poser sur une photo ou un avatar.
 * Le conteneur parent doit etre en position relative ; c'est l'appelant qui
 * choisit le coin (ex. `style={{ bottom: 0, right: 0 }}`).
 */
export function CertifiedPhotoBadge({
  size = 26,
  style,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[styles.pastille, { width: size, height: size, borderRadius: size / 2 }, style]}
    >
      <ShieldCheck color="#ffffff" size={Math.round(size * 0.58)} strokeWidth={2.5} />
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
  genotypeOnPhoto: { backgroundColor: 'rgba(34,211,238,0.35)' },
  pastille: {
    position: 'absolute',
    backgroundColor: '#f59e0b',
    borderWidth: 2,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cyanInline: { backgroundColor: 'rgba(34,211,238,0.15)' },
  text: { fontSize: 12, fontWeight: '700' },
});
