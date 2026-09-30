/**
 * Villes proposees dans les selecteurs (formulaire de profil ET filtre du deck).
 *
 * Source UNIQUE : une ville ajoutee ici apparait partout. La constante est triee
 * a l'execution, donc l'ordre du fichier n'importe pas.
 *
 * Regle : des VILLES uniquement (pas de prefectures / regions). Les doublons
 * exacts sont ecartes par le Set ; deux graphies d'une meme ville se
 * ressemblent trop pour etre distinguees a l'ecran : garder une seule fois.
 * (Un profil qui a deja une ancienne valeur hors liste la conserve : le
 * formulaire affiche la valeur stockee telle quelle.)
 */
export const CITIES = Array.from(
  new Set([
  'Lomé', 'Sokodé', 'Kara', 'Atakpamé',
  'Dapaong', 'Tsévié', 'Aného', 'Kpalimé',
  'Notsé', 'Bassar', 'Amlamé', 'Badou',
  'Bafilo', 'Baguida', 'Bohou', 'Cinkassé',
  'Danyi', 'Kévé', 'Kandé', 'Kpagouda',
  'Mango', 'Niamtougou', 'Pagouda', 'Tchamba',
  'Vogan', 'Tabligbo', 'Guérin-Kouka',
  'Kanté', 'Mô', 'Tandjouaré',
  ])
).sort((a, b) => a.localeCompare(b, 'fr'));

/** Minuscules sans accents : « fes » doit trouver « Fès ». */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
