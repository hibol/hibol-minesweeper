import { ref, watch } from 'vue'

const THEME_KEY = "hibol-minesweeper:theme"
const TAP_ACTION_KEY = "hibol-minesweeper:tap-action"

// Refs partagées (singleton) : n'importe quel composant qui importe ces refs
// lit/écrit le même état réactif, sans plomberie de props/events — suffisant
// pour deux préférences globales, pas besoin d'un vrai store pour ça.
export const theme = ref(localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light")
export const tapAction = ref(localStorage.getItem(TAP_ACTION_KEY) === "flag" ? "flag" : "reveal")

// Appliqué tout de suite au chargement du module (pas seulement dans le
// watcher) pour que le thème soit posé dès l'import, avant le premier rendu.
document.documentElement.dataset.theme = theme.value

watch(theme, (value) => {
  document.documentElement.dataset.theme = value
  localStorage.setItem(THEME_KEY, value)
})

watch(tapAction, (value) => {
  localStorage.setItem(TAP_ACTION_KEY, value)
})
