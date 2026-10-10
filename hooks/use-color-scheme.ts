import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * Scheme de couleur normalise : 'light' | 'dark'.
 * Depuis RN 0.86 (SDK 57), ColorSchemeName inclut 'unspecified', ce qui
 * rendait illegale l'indexation de { light, dark } sous TypeScript 6.
 * Tout ce qui n'est pas explicitement 'dark' tombe en 'light' (comportement
 * identique a l'ancien `?? 'light'`).
 */
export function useColorScheme(): 'light' | 'dark' {
  return useRNColorScheme() === 'dark' ? 'dark' : 'light';
}
