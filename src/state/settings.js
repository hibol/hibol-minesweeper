import { ref, watch } from "vue"

const THEME_KEY = "hibol-minesweeper:theme"
const TAP_ACTION_KEY = "hibol-minesweeper:tap-action"
const LONG_PRESS_MS_KEY = "hibol-minesweeper:long-press-ms"
const SHOW_HELP_BUTTON_KEY = "hibol-minesweeper:show-help-button"
const SHOW_COORDINATES_KEY = "hibol-minesweeper:show-coordinates"

// Bornes du réglage (cf. Settings dans BurgerMenu.vue) : sous 300ms un appui
// long redevient trop facile à déclencher par accident, au-dessus de 1000ms
// il commence à se sentir cassé/pas réactif.
export const MIN_LONG_PRESS_MS = 300
export const MAX_LONG_PRESS_MS = 1000
export const DEFAULT_LONG_PRESS_MS = 500

// Refs partagées (singleton) : n'importe quel composant qui importe ces refs
// lit/écrit le même état réactif, sans plomberie de props/events — suffisant
// pour deux préférences globales, pas besoin d'un vrai store pour ça.
export const theme = ref(
  localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light",
)
export const tapAction = ref(
  localStorage.getItem(TAP_ACTION_KEY) === "flag" ? "flag" : "reveal",
)

function loadLongPressMs() {
  const stored = Number(localStorage.getItem(LONG_PRESS_MS_KEY))

  if (!stored || stored < MIN_LONG_PRESS_MS || stored > MAX_LONG_PRESS_MS) {
    return DEFAULT_LONG_PRESS_MS
  }

  return stored
}

export const longPressMs = ref(loadLongPressMs())

// Défaut à true (affiché) sauf opt-out explicite — même convention que
// theme/tapAction ci-dessus (comparaison à la valeur "off", pas à "on").
export const showHelpButton = ref(
  localStorage.getItem(SHOW_HELP_BUTTON_KEY) !== "false",
)

// Défaut à false (masqué) : repère de position (x;y du centre du viewport en
// mode infini) affiché dans le footer de stats — utile pour s'orienter /
// comparer, mais pas indispensable, donc opt-in (comparaison à "on", à
// l'inverse de showHelpButton).
export const showCoordinates = ref(
  localStorage.getItem(SHOW_COORDINATES_KEY) === "true",
)

// "reveal" reste le défaut sur tous les appareils (tap = clic gauche, long-
// press = clic droit, même convention des deux côtés) — pas de valeur par
// défaut à faire dépendre de l'appareil ici. isTouchDevice ne sert donc qu'à
// décider si le popup expliquant tap/long-press a un sens (cf. App.vue) :
// un joueur souris connaît déjà clic gauche/droit, pas besoin de le lui dire.
export const isTouchDevice = window.matchMedia("(pointer: coarse)").matches

// Stockage plein ou indisponible : le réglage vaut quand même pour la session.
function persist(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // rien à faire, l'état en mémoire suffit
  }
}

// La barre du navigateur (Chrome Android, PWA) prend la couleur du fond de
// page du thème, lue dans le CSS pour ne pas la dupliquer ici.
function applyTheme(value) {
  const root = document.documentElement
  root.dataset.theme = value
  const pageBg = getComputedStyle(root)
    .getPropertyValue("--color-page-bg")
    .trim()
  if (pageBg) {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", pageBg)
  }
}

// Appliqué tout de suite au chargement du module (pas seulement dans le
// watcher) pour que le thème soit posé dès l'import, avant le premier rendu.
applyTheme(theme.value)

watch(theme, (value) => {
  applyTheme(value)
  persist(THEME_KEY, value)
})

watch(tapAction, (value) => {
  persist(TAP_ACTION_KEY, value)
})

watch(longPressMs, (value) => {
  persist(LONG_PRESS_MS_KEY, value)
})

watch(showHelpButton, (value) => {
  persist(SHOW_HELP_BUTTON_KEY, value)
})

watch(showCoordinates, (value) => {
  persist(SHOW_COORDINATES_KEY, value)
})
