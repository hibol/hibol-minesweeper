import { watch } from "vue"
import {
  Capacitor,
  SystemBars,
  SystemBarsStyle,
  SystemBarType,
} from "@capacitor/core"
import { theme } from "./state/settings"

// Vocabulaire Capacitor inversé : Light = icônes sombres pour un fond clair.
const STYLE_FOR_THEME = {
  light: SystemBarsStyle.Light,
  dark: SystemBarsStyle.Dark,
}

const BARS = [SystemBarType.StatusBar, SystemBarType.NavigationBar]

// Les barres suivent le thème du jeu, pas celui du téléphone. Un échec du
// plugin ne doit rien casser : les icônes gardent juste leur style précédent.
export async function applySystemBarsStyle(gameTheme) {
  const style = STYLE_FOR_THEME[gameTheme] ?? SystemBarsStyle.Light
  try {
    await Promise.all(BARS.map((bar) => SystemBars.setStyle({ style, bar })))
  } catch (error) {
    console.error("SystemBars.setStyle failed", error)
  }
}

// Android seulement : sur le web, le navigateur gère ses propres barres.
// Renvoie de quoi arrêter le watch (tests).
export function installAndroidSystemBars() {
  if (Capacitor.getPlatform() !== "android") return () => {}
  return watch(theme, applySystemBarsStyle, { immediate: true })
}
