// mm:ss de la chasse au trésor, partagé entre la bannière de fin de journée
// (useTreasureHunt.js) et l'historique (BurgerMenu.vue).
export function formatTreasureTime(ms) {
  const totalSeconds = Math.floor(ms / 1000)
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0")
  const ss = String(totalSeconds % 60).padStart(2, "0")
  return `${mm}:${ss}`
}
