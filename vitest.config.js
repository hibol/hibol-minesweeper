import { defineConfig, coverageConfigDefaults } from 'vitest/config'

// Config Vitest volontairement SÉPARÉE de vite.config.js.
//
// vite.config.js charge @vitejs/plugin-vue et vite-plugin-pwa : deux plugins
// dont les tests du moteur n'ont aucun besoin (game.js est du JS pur, aucun
// import Vue) et qui, chargés pour rien, ralentiraient le démarrage de la
// suite et pourraient injecter des modules virtuels ('virtual:pwa-register/…')
// que Vitest devrait résoudre. defineConfig vient de 'vitest/config' (et pas
// de 'vite') : c'est la variante qui connaît la clé `test`.
export default defineConfig({
  test: {
    // Environnement par défaut : Node pur. Les tests du moteur n'ont pas
    // besoin d'un DOM. Le SEUL fichier qui touche localStorage
    // (src/saveTransfer.test.js) réclame jsdom via un commentaire
    // `// @vitest-environment jsdom` en tête de fichier — plus léger que de
    // basculer toute la suite sous jsdom.
    environment: 'node',

    coverage: {
      // v8 : instrumentation native de V8, pas de transformation Babel du
      // code source (istanbul). Plus rapide et fidèle au code réellement
      // exécuté.
      provider: 'v8',

      // On garde la liste d'exclusions par défaut de Vitest
      // (node_modules, dist, fichiers de config, .git…) — d'où le spread de
      // coverageConfigDefaults.exclude, sinon on la remplacerait entièrement
      // et le rapport se remplirait de bruit — puis on ajoute nos propres
      // exclusions :
      //   - **/*.vue          : la couche UI n'est pas dans le périmètre du jalon 1
      //   - src/icons.js      : table de données SVG, rien à tester
      //   - src/main.js       : bootstrap de l'app (montage Vue)
      //   - scripts/**        : outillage (autoplay), hors app
      //   - usePixelFog.js    : composable de rendu (canvas/brouillard)
      //   - **/*.config.js    : ce fichier + vite.config.js
      //   - **/*.test.js      : les tests eux-mêmes
      exclude: [
        ...coverageConfigDefaults.exclude,
        '**/*.vue',
        'src/icons.js',
        'src/main.js',
        'scripts/**',
        'src/composables/usePixelFog.js',
        '**/*.config.js',
        '**/*.test.js',
      ],
    },
  },
})
