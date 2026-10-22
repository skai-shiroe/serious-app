-- Correct disclosures that did not match the current storage and logging
-- implementation. Keep the rest of the administrator-managed legal JSON.
update public.admin_app_settings
set value = pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          value,
          '{privacy,1,paragraphs,1}',
          to_jsonb('Profil : prénom, âge, ville, bio, centres d’intérêt, photos et informations de compatibilité renseignées volontairement, comme le groupe sanguin et le statut vis-à-vis de la drépanocytose. Les photos de profil sont visibles aux utilisateurs auxquels Geno les propose et toute personne disposant de leur lien public peut également les consulter.'::text),
          false
        ),
        '{privacy,5,paragraphs,1}',
        to_jsonb('Les justificatifs de vérification sont conservés dans un espace privé jusqu’à la suppression du compte, sauf obligation légale de conservation. La durée de conservation des journaux techniques dépend de leur finalité et des règles du fournisseur d’hébergement.'::text),
        false
      ),
      '{privacy,6,paragraphs,1}',
      to_jsonb('Les justificatifs de vérification sont stockés dans un espace privé et accessibles aux personnes habilitées à traiter les demandes. Ils sont supprimés lors de la suppression du compte. Les accès à la base sont protégés par des règles Row Level Security et les échanges utilisent TLS ; les clés privilégiées ne sont jamais embarquées dans l’application.'::text),
      false
    ),
    updated_at = now()
where setting_key = 'legal_content'
  and value #> '{privacy,5,paragraphs}' is not null
  and value #> '{privacy,6,paragraphs}' is not null;
