import type { ImageSource } from 'expo-image';

/**
 * Pack de stickers embarques (assets/stickers, genere par
 * scripts/gen-stickers.py). Envoyes avec type='sticker' et
 * content=`sticker:<name>` ; inconnu -> repli 🎏 côté reception.
 */
export const STICKERS: { name: string; label: string; source: ImageSource }[] = [
  { name: 'joy', label: 'Joie', source: require('../assets/stickers/joy.png') },
  { name: 'love', label: 'Amour', source: require('../assets/stickers/love.png') },
  { name: 'cool', label: 'Cool', source: require('../assets/stickers/cool.png') },
  { name: 'wink', label: 'Clin d\'oeil', source: require('../assets/stickers/wink.png') },
  { name: 'blush', label: 'Rouge', source: require('../assets/stickers/blush.png') },
  { name: 'cry', label: 'Pleure', source: require('../assets/stickers/cry.png') },
  { name: 'angry', label: 'Colere', source: require('../assets/stickers/angry.png') },
  { name: 'sleepy', label: 'Dodo', source: require('../assets/stickers/sleepy.png') },
  { name: 'surprised', label: 'Surpris', source: require('../assets/stickers/surprised.png') },
  { name: 'tongue', label: 'Langue', source: require('../assets/stickers/tongue.png') },
  { name: 'heart', label: 'Coeur', source: require('../assets/stickers/heart.png') },
  { name: 'heart-broken', label: 'Coeur casse', source: require('../assets/stickers/heart-broken.png') },
  { name: 'heart-sparkle', label: 'Coeur etincelle', source: require('../assets/stickers/heart-sparkle.png') },
  { name: 'thumbs-up', label: 'Bravo', source: require('../assets/stickers/thumbs-up.png') },
  { name: 'fire', label: 'Feu', source: require('../assets/stickers/fire.png') },
  { name: 'star', label: 'Etoile', source: require('../assets/stickers/star.png') },
  { name: 'hundred', label: '100', source: require('../assets/stickers/hundred.png') },
  { name: 'check', label: 'OK', source: require('../assets/stickers/check.png') },
  { name: 'warning', label: 'Attention', source: require('../assets/stickers/warning.png') },
  { name: 'kiss', label: 'Bisou', source: require('../assets/stickers/kiss.png') },
  { name: 'zzz', label: 'Zzz', source: require('../assets/stickers/zzz.png') },
  { name: 'sparkle', label: 'Etincelles', source: require('../assets/stickers/sparkle.png') },
  { name: 'cat', label: 'Chat', source: require('../assets/stickers/cat.png') },
  { name: 'bear', label: 'Ourson', source: require('../assets/stickers/bear.png') },
  { name: 'panda', label: 'Panda', source: require('../assets/stickers/panda.png') },
  { name: 'bunny', label: 'Lapin', source: require('../assets/stickers/bunny.png') },
  { name: 'gift', label: 'Cadeau', source: require('../assets/stickers/gift.png') },
  { name: 'party', label: 'Fete', source: require('../assets/stickers/party.png') },
  { name: 'rose', label: 'Rose', source: require('../assets/stickers/rose.png') },
  { name: 'coffee', label: 'Cafe', source: require('../assets/stickers/coffee.png') },
];

const BY_NAME = new Map(STICKERS.map((s) => [s.name, s.source]));

/** Source du sticker, ou null si inconnu (repli 🎏 côté reception). */
export function stickerSource(name: string): ImageSource | null {
  return BY_NAME.get(name) ?? null;
}
