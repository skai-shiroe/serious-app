import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';

export type LegalPage = 'privacy' | 'terms' | 'legal';

const LEGAL_URLS: Record<LegalPage, string> = {
  privacy: 'https://geno.love/fr/privacy',
  terms: 'https://geno.love/fr/terms',
  legal: 'https://geno.love/fr/legal',
};

/** Ouvre la version publique et à jour du document dans le navigateur intégré. */
export function openLegalPage(page: LegalPage) {
  return WebBrowser.openBrowserAsync(LEGAL_URLS[page]).catch(() => {
    Alert.alert('Page indisponible', 'Impossible d’ouvrir cette page. Vérifie ta connexion puis réessaie.');
  });
}
