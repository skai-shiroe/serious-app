import { BadgeCheck, ShieldCheck } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

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
 * Pastille « Profil certifie » : affichee quand l'identite ET le genotype sont
 * verifies. Elle remplace les badges individuels pour ne pas surcharger.
 */
export function CertifiedBadge({
  variant = 'inline',
}: {
  variant?: 'inline' | 'onPhoto';
}) {
  const isDark = useColorScheme() === 'dark';
  const onPhoto = variant === 'onPhoto';

  const tint = onPhoto ? '#ffffff' : isDark ? '#fbbf24' : '#b45309';
  const background = onPhoto
    ? 'rgba(255,255,255,0.24)'
    : isDark
      ? 'rgba(251,191,36,0.18)'
      : 'rgba(245,158,11,0.16)';

  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <ShieldCheck color={tint} size={13} />
      <Text style={[styles.text, { color: tint }]}>Profil certifié</Text>
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
  cyanInline: { backgroundColor: 'rgba(34,211,238,0.15)' },
  text: { fontSize: 12, fontWeight: '700' },
});
