import { createApp } from 'vue'
// Polices auto-hébergées (plus de <link> vers Google Fonts dans index.html) :
// indispensable pour un rendu correct hors-ligne. On n'importe que le sous-set
// latin en poids 400 — l'UI est en anglais, le reste serait du poids mort.
import '@fontsource/vt323/latin-400.css'
import '@fontsource/press-start-2p/latin-400.css'
import './style.css'
import App from './App.vue'

createApp(App).mount('#app')
