// mm:ss.cc (centièmes), non plafonné — partagé entre le chrono live Legacy
// (App.vue, legacyTimeLabel) et les listes de temps déjà enregistrés
// (BurgerMenu.vue, Local et Online) : même format partout, y compris pour
// des runs > 99s (intermediate/expert notamment, courant pour un joueur pas
// speedrunner).
export function formatLegacyTime(ms) {
  const totalSeconds = Math.floor(ms / 1000)
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0")
  const ss = String(totalSeconds % 60).padStart(2, "0")
  const centis = String(Math.floor(ms / 10) % 100).padStart(2, "0")
  return `${mm}:${ss}.${centis}`
}
