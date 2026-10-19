# Modèles d'e-mails Supabase Auth — Geno

Les modèles sont prêts à être copiés dans **Supabase Dashboard → Authentication → Emails → Templates**. Le connecteur de ce projet ne permet pas de lire ou modifier ces paramètres Auth hébergés ; ils ne sont donc pas encore appliqués au projet.

| Modèle Supabase | Fichier | Objet proposé |
| --- | --- | --- |
| Confirm signup | `confirmation.html` | `Confirme ton adresse e-mail pour Geno` |
| Reset password | `recovery.html` | `Réinitialise ton mot de passe Geno` |
| Magic link | `magic-link.html` | `Ton lien de connexion Geno` |
| Change email address | `email-change.html` | `Confirme ta nouvelle adresse e-mail` |

Chaque modèle conserve `{{ .ConfirmationURL }}` afin que Supabase génère le lien adapté au flux concerné. Les flux d'inscription et de récupération de l'application utilisent le deep link `auth-callback`; garde `seriousapp://auth-callback` dans la liste **Redirect URLs** de la configuration Auth.

Pour l'URL du site, configure une adresse HTTPS publique que tu contrôles (par exemple le domaine officiel de Geno). Ne mets pas `seriousapp://` dans **Site URL**. Le domaine de production n'étant pas confirmé dans le dépôt, aucune URL n'est inventée ici.

Après collage dans le Dashboard, envoie un e-mail de test pour chacun des flux utilisés : confirmation d'inscription, récupération de mot de passe et lien de connexion. Le changement d'adresse se teste depuis une demande réelle de changement d'e-mail.
