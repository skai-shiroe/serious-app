import React from 'react';
import LegalScreen from '@/components/legal-screen';

/**
 * Conditions Générales d'Utilisation — placeholder pour la conformité
 * stores (Google Play + App Store exigent un accès depuis l'app).
 * Le texte est rédigé pour Geno (rencontres, données de santé
 * déclarées) mais doit être relu par un conseil juridique.
 */
export default function TermsScreen() {
  return (
    <LegalScreen
      title="Conditions d'utilisation"
      updatedAt="13 octobre 2026"
      sections={[
        {
          heading: '1. Objet',
          paragraphs: [
            "Les présentes conditions générales d'utilisation (« CGU ») régissent l'accès et l'utilisation de l'application Geno (« l'Application »), éditée par [RAISON SOCIALE — à compléter], [forme juridique] au capital de [montant] €, immatriculée au RCS de [ville] sous le numéro [n°], dont le siège social est situé [adresse] (« l'Éditeur »).",
            "En créant un compte et en utilisant l'Application, vous reconnaissez avoir lu et accepté les présentes CGU sans réserve.",
          ],
        },
        {
          heading: '2. Éligibilité',
          paragraphs: [
            "L'Application est strictement réservée aux personnes majeures. En créant un compte, vous certifiez avoir au moins 18 ans révolus.",
            "L'Application est un service de rencontres. Elle ne constitue en aucun cas un service de conseil médical, génétique ou de santé : les informations affichées sur le profil (notamment les marqueurs de santé déclarés) sont des informations de compatibilité partagées volontairement entre utilisateurs et ne remplacent jamais l'avis d'un professionnel de santé.",
          ],
        },
        {
          heading: '3. Création de compte',
          paragraphs: [
            "La création d'un compte suppose la fournie d'informations exactes et à jour (notamment une adresse e-mail valide). Vous êtes responsable de la confidentialité de vos identifiants et de toute activité effectuée depuis votre compte.",
            "Un compte ne peut être cédé ni vendu. Vous ne pouvez détenir qu'un seul compte actif.",
          ],
        },
        {
          heading: '4. Comportement attendu',
          paragraphs: [
            "Geno promeut des échanges respectueux entre adultes consentants. Sont strictement interdits : tout contenu ou propos à caractère harcelant, discriminatoire, menaçant, pornographique ou illégal ; l'usurpation d'identité ; la collecte de données personnelles d'autres utilisateurs ; la publicité non sollicitée ; la publication de mineurs, y compris la vôtre.",
            "Toute photo de nu, ou contournement de la modération automatique (lettres homoglyphes, images contournant les filtres), entraînera la suspension immédiate du compte.",
          ],
        },
        {
          heading: '5. Vérification et modération',
          paragraphs: [
            "Afin de lutter contre les faux profils, Geno propose une vérification d'identité et applique une modération automatisée puis manuelle (signalements traités par l'équipe de confiance).",
            "Vous pouvez bloquer et signaler tout utilisateur depuis son profil ou la conversation. Les comptes bloqués ne peuvent plus interagir ni se retrouver dans les decks de découverte.",
          ],
        },
        {
          heading: '6. Suppression de compte',
          paragraphs: [
            "Vous pouvez supprimer votre compte à tout moment depuis l'écran Profil > « Supprimer mon compte ». La suppression est définitive et immédiate : profil, photos, matchs et messages sont supprimés de la base de données et de l'authentification.",
            "L'Éditeur peut suspendre ou résilier un compte en cas de manquement aux présentes CGU, sans préavis ni indemnité.",
          ],
        },
        {
          heading: '7. Responsabilité',
          paragraphs: [
            "Geno met tout en œuvre pour assurer la disponibilité de l'Application mais ne garantit pas l'absence d'interruption, ni l'adéquation des profils proposés. Les rencontres en personne se font sous votre seule responsabilité.",
            "L'Éditeur ne saurait être tenu responsable des échanges entre utilisateurs ni du contenu qu'ils publient.",
          ],
        },
        {
          heading: '8. Droit applicable',
          paragraphs: [
            "Les présentes CGU sont soumises au droit français. En cas de litige, une résolution amiable sera recherchée avant toute action judiciaire.",
            "Contact : [EMAIL DE CONTACT — à compléter]",
          ],
        },
      ]}
    />
  );
}