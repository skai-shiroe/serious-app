// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // eslint-config-expo 57 (SDK 57) active les lints "React Compiler".
    // Le code actuel (deck swipe, effets du RootLayout, callbacks de gestes)
    // precède ces regles : on les descend en avertissement pour garder la
    // porte d'entree eslint (0 erreur) tout en les laissant visibles, et on
    // les remontera en erreur au fil d'une migration dediee.
    rules: {
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
]);
