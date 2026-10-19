update public.admin_app_settings
set value = value || jsonb_build_object(
  'swipe_like', coalesce(value->'swipe_like','{"title":"❤️ Quelqu’un vous a liké","body":"Retournez dans Découvrir pour voir qui s’intéresse à vous","enabled":true}'::jsonb),
  'admin_verification', coalesce(value->'admin_verification','{"title":"Nouvelle demande de vérification","body":"Une demande attend votre examen dans le dashboard","enabled":true}'::jsonb)
)
where setting_key='push_templates';
