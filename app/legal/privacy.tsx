import React from 'react';
import DynamicLegalScreen from '@/components/dynamic-legal-screen';

/**
- Politique de confidentialité — RGPD + conformité stores (Google Play +
- App Store exigent un accès depuis l'app). Adaptée aux données de santé
- déclarées (marqueurs de compatibilité) et aux exigences de sécurité
- mineurs des stores pour les apps de rencontres.
 */
export default function PrivacyScreen() {
  return (
    <DynamicLegalScreen
      settingKey="privacy"
      title="Politique de confidentialité"
      updatedAt="22 octobre 2026"
      sections={[
        {
          heading: '1. Responsable de traitement',
          paragraphs: [
            "Le responsable du traitement des données est la société Geno Togo. Contact DPO / Confidentialité : privacy@geno.app.",
          ],
        },
        {
          heading: '2. Données collectées',
          paragraphs: [
            "Compte : adresse e-mail, mot de passe (haché), identifiant unique.",
            "Profil : prénom, âge, ville, bio, centres d'intérêt, photos, et les informations de compatibilité que vous renseignez volontairement, comme le groupe sanguin et le statut vis-à-vis de la drépanocytose. Les photos de profil sont visibles aux utilisateurs auxquels Geno les propose et toute personne disposant de leur lien public peut également les consulter.",
            "Utilisation : matchs, likes, messages échangés, signalements et blocages, interactions avec les conseils de coaching.",
            "Technique : identifiants de notification push (sans données de localisation fine), journaux de connexion.",
            "Aucune donnée de géolocalisation précise n'est collectée : la localisation est limitée à la ville déclarée.",
          ],
        },
        {
          heading: '3. Finalités',
          paragraphs: [
            "Fournir le service de rencontres (matching, messagerie) ; assurer la sécurité de la plateforme (modération, détection de faux profils) ; envoyer les notifications liées aux matchs et messages ; améliorer l'expérience utilisateur.",
            "Vos marqueurs de santé déclarés servent à appliquer les règles de compatibilité aux propositions. Ils ne sont pas renvoyés dans les profils de découverte ou les likes reçus ; ils ne deviennent visibles à l'autre personne qu'après un match réciproque, si vous avez choisi de les renseigner.",
          ],
        },
        {
          heading: '4. Base légale',
          paragraphs: [
            "Exécution du contrat (création de compte et utilisation du service) ; consentement explicite pour les données de santé déclarées et les notifications push ; intérêt légitime pour la sécurité et la modération.",
          ],
        },
        {
          heading: '5. Partage et hébergement',
          paragraphs: [
            "Les données sont hébergées par Supabase (serveurs certifiés, chiffrement en transit et au repos). Les notifications push transitent par les services Apple (APNs) et Google (FCM).",
            "Aucune donnée personnelle n'est vendue ni louée à des tiers à des fins publicitaires.",
          ],
        },
        {
          heading: '6. Conservation',
          paragraphs: [
            "Les données sont conservées pendant la durée d'utilisation du compte, puis supprimées (ou anonymisées) lors de la suppression du compte, action réalisable depuis Profil > Sécurité et confidentialité.",
            "Les justificatifs de vérification sont conservés dans un espace privé jusqu’à la suppression du compte, sauf obligation légale de conservation. La durée de conservation des journaux techniques dépend de leur finalité et des règles du fournisseur d’hébergement.",
          ],
        },
        {
          heading: '7. Sécurité',
          paragraphs: [
            "Contrôle d'accès aux données au niveau base (Row Level Security), authentification par jeton, chiffrement TLS des échanges, service role jamais exposé côté client.",
            "Les justificatifs de vérification sont stockés dans un espace privé et accessibles aux personnes habilitées à traiter les demandes. Ils sont supprimés lors de la suppression du compte. Les accès à la base sont protégés par des règles Row Level Security et les échanges utilisent TLS ; les clés privilégiées ne sont jamais embarquées dans l’application.",
          ],
        },
        {
          heading: '8. Vos droits',
          paragraphs: [
            "Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation et de portabilité de vos données, ainsi que d'un droit d'opposition. Exercez-les depuis Profil > Sécurité et confidentialité (suppression directe) ou par e-mail à privacy@geno.app.",
            "Vous pouvez également introduire une réclamation auprès de l'autorité de protection des données compétente (ex: IPDCP au Togo ou la CNIL en France).",
          ],
        },
        {
          heading: '9. Contact',
          paragraphs: [
            "Pour toute question relative à la confidentialité ou à la protection de vos données : privacy@geno.app.",
          ],
        },
      ]}
    />
  );
}
