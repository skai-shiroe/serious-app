/**
 * Villes proposees dans les selecteurs (formulaire de profil ET filtre du deck).
 *
 * Source UNIQUE : une ville ajoutee ici apparait partout. La constante est triee
 * a l'execution, donc l'ordre du fichier n'importe pas.
 *
 * Pour ajouter une ville : une ligne. Les doublons exacts sont ecartes par le Set
 * (et deux graphies d'une meme ville se ressemblent trop pour etre distinguees
 * a l'ecran : garder une seule fois).
 */
/**
 * Villes proposees dans le selecteur (constante simple a editer : ajouter ou
 * retirer une ville ici suffit). Triee automatiquement a l'execution.
 */
export const CITIES = Array.from(
  new Set([
  'Lomé', 'Sokodé', 'Kara', 'Atakpamé',
  'Dapaong', 'Tsévié', 'Aného', 'Kpalimé',
  'Notsé', 'Bassar', 'Amlamé', 'Badou',
  'Bafilo', 'Baguida', 'Bohou', 'Cinkassé',
  'Danyi', 'Kévé', 'Kandé', 'Kpagouda',
  'Mango', 'Niamtougou', 'Pagouda', 'Tchamba',
  'Tchaoudjo', 'Vogan', 'Tabligbo', 'Guérin-Kouka',
  'Kanté', 'Kozah', 'Mô', 'Ogou',
  'Assoli', 'Binah', 'Doufelgou', 'Oti',
  'Oti-Sud', 'Tandjouaré', 'Tone', 'Vo',
  'Yoto', 'Zio',
  ])
).sort((a, b) => a.localeCompare(b, 'fr'));

/** Minuscules sans accents : « fes » doit trouver « Fès ». */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
