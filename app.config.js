/**
 * Config dynamique — unique raison d'etre : injecter `google-services.json`
 * (Firebase / FCM v1) sans le versionner (le depot est public).
 *
 *  - en local : le fichier est a la racine du projet -> ./google-services.json ;
 *  - sur EAS Build : la variable d'environnement de type FICHIER
 *    `GOOGLE_SERVICES_JSON` (environnement `preview`/`production`, visibilite
 *    `sensitive`) contient le CHEMIN du fichier, cree hors du dossier projet
 *    par le runner (cf. README, section « Notifications et certification »).
 *
 * Le reste de la configuration vient de app.json : ce wrapper ne fait que
 * surcharger ce seul champ.
 */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
});
