import type { Metadata } from 'next';
import PublicPrivacyContent from '@/components/public-privacy-content';

export const metadata: Metadata = {
  title: 'Politique de confidentialité — Geno',
  description: 'Comment Geno collecte, utilise, protège et supprime les données personnelles.',
};

export default function PrivacyPage() {
  return <PublicPrivacyContent />;
}
