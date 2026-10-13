import React from 'react';
import LegalScreen from '@/components/legal-screen';

/**
 * Politique de confidentialité — RGPD + conformité stores (Google Play +
 * App Store exigent un accès depuis l'app). Adaptée aux données de santé
 * déclarées (marqueurs de compatibilité) et aux exigences de sécurité
 * mineurs des stores pour les apps de rencontres.
 */
export default function PrivacyScreen() {
  return (
    <LegalScreen
      title="Politique de confidentialité"
      updatedAt="13 octobre 2026"
      sections={[
        {
          heading: '1. Responsable de traitement',
          paragraphs: [
            "Le responsable du traitement des données est [RAISON SOCIALE — à compléter], [siège social — à compléter]. Contact : [EMAIL DE CONTACT — à compléter].",
          ],
        },
        {
          heading: '2. Données collectées',
          paragraphs: [
            "Compte : adresse e-mail, mot de passe (haché), identifiant unique.",
            "Profil : prénom, âge, ville, bio, centres d'intérêt, photos, et les informations de compatibilité que vous renseignez volontairement, y compris vos marqueurs de santé déclarés (par exemple le statut vis-à-vis de la drépanocytose).",
            "Utilisation : matchs, likes, messages échangés, signalements et blocages, interactions avec les conseils de coaching.",
            "Technique : identifiants de notification push (sans données de localisation fine), journaux de connexion.",
            "Aucune donnée de géolocalisation précise n'est collectée : la localisation est limitée à la ville déclarée.",
          ],
        },
        {
          heading: '3. Finalités',
          paragraphs: [
            "Fournir le service de rencontres (matching, messagerie) ; assurer la sécurité de la plateforme (modération, détection de faux profils) ; envoyer les notifications liées aux matchs et messages ; améliorer l'expérience utilisateur.",
            "Vos marqueurs de santé ne sont visibles que par les personnes avec qui vous avez un match, et uniquement si vous avez choisi de les renseigner.",
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
            "Les données sont hébergées par Supabase (serveurs situés dans l'Union européenne, chiffrement en transit et au repos). Les notifications push transitent par les services Apple (APNs) et Google (FCM).",
            "Aucune donnée personnelle n'est vendue ni louée à des tiers à des fins publicitaires.",
          ],
        },
        {
          heading: '6. Conservation',
          paragraphs: [
            "Les données sont conservées pendant la durée d'utilisation du compte, puis supprimées (ou anonymisées) lors de la suppression du compte, action réalisable directement dans l'application depuis l'écran Profil.",
            "Les journaux techniques sont conservés au maximum 12 mois.",
          ],
        },
        {
          heading: '7. Sécurité',
          paragraphs: [
            "Contrôle d'accès aux données au niveau base (Row Level Security), authentification par jeton, chiffrement TLS des échanges, service role jamais exposé côté client.",
            "La vérification d'identité est traitée par un prestataire spécialisé ; les documents fournis ne sont pas conservés au-delà du temps nécessaire au contrôle.",
          ],
        },
        {
          heading: '8. Vos droits',
          paragraphs: [
            "Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation et de portabilité de vos données, ainsi que d'un droit d'opposition. Exercez-les depuis l'écran Profil (suppression directe) ou par e-mail à [EMAIL DE CONTACT — à compléter].",
            "Vous pouvez également introduire une réclamation auprès de la CNIL (cnil.fr).",
          ],
        },
        {
          heading: '9. Contact',
          paragraphs: [
            "Pour toute question relative à la confidentialité : [EMAIL DE CONTACT — à compléter].",
          ],
        },
      ]}
    />
  );
}