import js from "@eslint/js"
import pluginVue from "eslint-plugin-vue"
import configPrettier from "eslint-config-prettier"
import globals from "globals"

// Flat config (format ESLint 9+, remplace .eslintrc). `pluginVue`
// couvre le JS *et* le <template> des .vue ; configPrettier vient en
// dernier pour désactiver les règles ESLint qui se disputeraient avec
// Prettier sur la mise en forme (indentation, etc.) — chacun son rôle.
export default [
  {
    ignores: [
      "dist/**",
      "dev-dist/**",
      "coverage/**",
      "android/**",
      "node_modules/**",
      "scripts/renders/**",
    ],
  },
  js.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Un paramètre volontairement ignoré se préfixe _ (rare dans ce repo,
      // mais évite un faux positif du jour où ça arrive).
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      // Pensée pour des composants de bibliothèque à plusieurs appelants
      // incertains. Ici chaque composant a un seul site d'appel (App.vue),
      // qui fournit toujours une vraie valeur — des `default:` forcés sur
      // 12 props réparties sur 8 composants seraient du bruit sans filet
      // réel derrière.
      "vue/require-default-prop": "off",
    },
  },
  configPrettier,
]
