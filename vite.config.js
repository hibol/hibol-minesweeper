import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// Deux cibles de build depuis le même src/, choisies via VITE_TARGET :
//   - 'pages' (défaut) : déploiement GitHub Pages de projet. La page est
//     servie sous https://hibol.github.io/hibol-minesweeper/, donc `base`
//     DOIT être le sous-chemin du repo, et le service worker est actif.
//   - 'apk' : la coquille Android (Capacitor) sert dist/ en local depuis
//     https://localhost/. Là il n'y a pas de sous-chemin — `base` doit être
//     relatif ('./') pour que polices @fontsource, icônes, manifest et
//     script d'entrée résolvent correctement — et le service worker n'a
//     aucun intérêt (rien à mettre en cache réseau, tout est déjà local) :
//     on le désactive pour éviter une origine SW figée dans l'APK.
// CI (deploy.yml) ne fixe pas VITE_TARGET → cible 'pages', comportement
// historique strictement inchangé.
const target = process.env.VITE_TARGET || 'pages'
const isApk = target === 'apk'
const base = isApk ? './' : '/hibol-minesweeper/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    vue(),
    VitePWA({
      // Cible 'apk' : le plugin reste présent (le module virtuel
      // 'virtual:pwa-register/vue' importé par PwaUpdatePrompt.vue doit
      // rester résolvable), mais `disable` supprime la génération du SW,
      // du manifest et du précache. useRegisterSW() devient un no-op.
      disable: isApk,
      // 'prompt' : quand une nouvelle version est déployée, le service
      // worker se télécharge mais reste EN ATTENTE. On affiche une bannière
      // "New version available" (PwaUpdatePrompt.vue) et c'est le joueur qui
      // déclenche le rechargement — jamais au milieu d'une partie.
      registerType: 'prompt',
      // On enregistre nous-mêmes le service worker via useRegisterSW() dans
      // PwaUpdatePrompt.vue, donc pas d'injection auto du script dans le HTML.
      injectRegister: false,
      // Fichiers du dossier public/ à faire précacher en plus de ce que le
      // build génère (Workbox ne voit que le contenu de dist/, et ces
      // assets-là ne sont référencés qu'indirectement).
      includeAssets: ['favicon.svg', 'og-image.jpg', 'apple-touch-icon-180.png'],
      manifest: {
        id: base,
        name: 'Hibol Minesweeper',
        short_name: 'Minesweeper',
        description:
          'An 8-bit minesweeper with a classic mode and an infinite mode where mine density ramps the further you explore.',
        lang: 'en',
        // start_url / scope : explicités mais identiques à ce que le plugin
        // déduirait de `base`. Le scope limite le service worker à ce
        // sous-chemin, ce qu'on veut sur un Pages de projet partagé.
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        // theme_color : teinte de la barre système / du multitâche quand
        // l'app tourne en standalone. background_color : couleur du splash
        // affiché le temps que le JS démarre. Fond sombre facultatif mais
        // cohérent avec l'esprit 8-bit.
        theme_color: '#1a1a1a',
        background_color: '#1a1a1a',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          // 'maskable' : Android recadre l'icône dans sa propre forme
          // (cercle, goutte…), d'où une version avec plus de marge.
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Sans screenshots, Chrome n'affiche que la boîte d'installation
        // minimale. Il faut au moins une capture form_factor 'wide' (desktop)
        // ET une non-'wide' (mobile) pour débloquer l'UI d'install enrichie.
        screenshots: [
          {
            src: 'screenshot-wide.png',
            sizes: '1280x800',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Classic minefield on desktop',
          },
          {
            src: 'screenshot-narrow.png',
            sizes: '412x915',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Classic minefield on mobile',
          },
        ],
      },
      workbox: {
        // Extensions à précacher. On ajoute woff/woff2 (polices
        // auto-hébergées via @fontsource) et webp/jpg (og-image) aux
        // défauts js/css/html/svg/png/ico.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2,webp,jpg}'],
        // SPA : toute navigation hors-ligne retombe sur l'index, le routeur
        // client prend le relais.
        navigateFallback: `${base}index.html`,
        // Purge les anciens caches Workbox d'une version précédente.
        cleanupOutdatedCaches: true,
      },
      // Le service worker ne tourne pas en `npm run dev` — on teste le PWA
      // sur `npm run build && npm run preview`.
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
