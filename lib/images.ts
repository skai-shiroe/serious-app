import { Image } from 'expo-image';

/**
 * Politique de cache unique pour toute l'app : memoire + repli disque.
 *
 * Le defaut d'expo-image est 'disk' : chaque instance d'image doit relire et
 * redecoder le fichier, ce qui provoque un flash gris quand une photo deja vue
 * est reaffichee (swipe, avatars, bottom sheet...). 'memory-disk' partage
 * l'image deja decodee en memoire entre toutes les instances.
 */
export const IMAGE_CACHE_POLICY = 'memory-disk' as const;

/**
 * Source d'image a partir d'une liste de photos.
 * Renvoie `undefined` si absente : plus aucun appel au placeholder externe
 * `via.placeholder.com`, qui ralentissait l'affichage sans photo.
 */
export function photoSource(photos?: string[] | null, index = 0) {
  const uri = photos?.[index];
  return uri ? { uri } : undefined;
}

/** Source d'image a partir d'une URL unique. */
export function imageSource(uri?: string | null) {
  return uri && uri.startsWith('http') ? { uri } : undefined;
}

/**
 * Precharge des images dans le cache memoire, sans bloquer l'UI.
 * A appeler des qu'une liste est chargee (avatars, photos du profil suivant...).
 */
export function prefetchImages(urls: Array<string | undefined | null>) {
  const clean = urls.filter(
    (uri): uri is string => typeof uri === 'string' && uri.startsWith('http')
  );
  if (clean.length === 0) return;
  void Image.prefetch(clean, IMAGE_CACHE_POLICY).catch(() => undefined);
}
