import React from 'react';
import LegalScreen from '@/components/legal-screen';

/**
- Conditions Générales d'Utilisation — Conforme aux exigences des stores
- (Google Play + App Store) pour les applications de rencontres.
- Inclut les clauses de modération, d'âge minimum (18+) et de non-responsabilité
- médicale pour les marqueurs de compatibilité déclarés.
 */
export default function TermsScreen() {
  return (
    <LegalScreen
      title="Conditions d'utilisation"
      updatedAt="13 octobre 2026"
      sections={[
        {
          heading: '1. Objet et Éditeur',
          paragraphs: [
            "Les présentes conditions générales d'utilisation (« CGU ») régissent l'accès et l'utilisation de l'application Geno (« l'Application »), éditée par la société Geno Togo (« l'Éditeur »). Contact : legal@geno.app.",
            "En créant un compte et en utilisant l'Application, vous reconnaissez avoir lu et accepté les présentes CGU sans réserve.",
          ],
        },
        {
          heading: '2. Éligibilité et avertissement médical',
          paragraphs: [
            "L'Application est strictement réservée aux personnes majeures. En créant un compte, vous certifiez sur l'honneur avoir au moins 18 ans révolus.",
            "Avertissement important : Geno est un service de mise en relation sociale et amoureuse. L'Application ne constitue en aucun cas un service médical, un laboratoire d'analyses, ni un conseil en génétique ou en santé. Les informations affichées sur les profils (notamment les marqueurs de compatibilité déclarés comme le statut vis-à-vis de la drépanocytose) sont purement déclaratives et partagées volontairement par les utilisateurs. Elles ne remplacent en aucun cas un examen médical ou l'avis d'un professionnel de santé.",
          ],
        },
        {
          heading: '3. Création et sécurité du compte',
          paragraphs: [
            "La création d'un compte nécessite la fourniture d'informations exactes, sincères et à jour (notamment une adresse e-mail valide). Vous êtes seul responsable de la confidentialité de vos identifiants et de toute activité effectuée depuis votre compte.",
            "Un compte est strictement personnel : il ne peut être cédé, prêté ni vendu. Vous ne pouvez détenir qu'un seul compte actif sur la plateforme.",
          ],
        },
        {
          heading: '4. Comportement attendu et modération',
          paragraphs: [
            "Geno promeut des échanges bienveillants et respectueux. Sont strictement interdits : tout propos ou contenu à caractère harcelant, haineux, discriminatoire, menaçant, pornographique, pédopornographique ou illégal ; l'usurpation d'identité ; le spamming ; la publicité non sollicitée et la publication de photos de personnes mineures.",
            "Toute publication de nudité, d'actes explicites ou toute tentative de contournement des filtres de modération automatique entraînera la suspension immédiate et définitive du compte, sans préavis.",
          ],
        },
        {
          heading: '5. Vérification des profils et sécurité',
          paragraphs: [
            "Afin de garantir un environnement sûr et de lutter contre les faux comptes, Geno met en place un système de vérification d'identité ainsi qu'une modération hybride (automatisée et humaine).",
            "Vous disposez à tout moment de la possibilité de bloquer et de signaler un utilisateur depuis son profil ou la discussion. Un profil bloqué ne pourra plus interagir avec vous ni apparaître dans votre fil de découverte.",
          ],
        },
        {
          heading: '6. Suppression et résiliation',
          paragraphs: [
            "Vous pouvez supprimer votre compte à tout moment directement depuis l'application via l'écran Profil > Supprimer mon compte. Cette action est immédiate et irréversible : profil, photos, matchs et messages seront définitivement supprimés.",
            "L'Éditeur se réserve le droit de suspendre ou de résilier l'accès d'un utilisateur à l'Application sans préavis en cas de violation des présentes CGU ou d'atteinte à la sécurité de la communauté.",
          ],
        },
        {
          heading: '7. Limites de responsabilité',
          paragraphs: [
            "L'Éditeur met en œuvre tous les moyens raisonnables pour assurer la disponibilité et la sécurité de l'Application. Toutefois, Geno ne garantit pas une continuité de service ininterrompue ni le succès des rencontres initiées.",
            "Les échanges et rencontres en personne se font sous la responsabilité exclusive des utilisateurs. L'Éditeur ne saurait être tenu responsable du comportement des utilisateurs en dehors ou au sein de l'Application.",
          ],
        },
        {
          heading: '8. Droit applicable et contact',
          paragraphs: [
            "Les présentes CGU sont régies et interprétées conformément aux lois en vigueur au Togo. En cas de litige, les parties s'engagent à rechercher une solution amiable prioritaire avant toute action judiciaire.",
            "Pour toute question juridique ou signalement spécifique : legal@geno.app ou contact@geno.app.",
          ],
        },
      ]}
    />
  );
}