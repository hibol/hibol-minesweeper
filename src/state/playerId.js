const PLAYER_ID_KEY = "hibol-minesweeper:player-id"

// Identifiant d'appareil pour le classement en ligne (cf.
// temp/leaderboards-plan.md §3.2) : généré une fois, persisté, JAMAIS
// affiché — sert seulement au serveur à savoir que plusieurs soumissions
// viennent du même joueur (et à figer son pseudo dès la 1re soumission
// acceptée). Pas un ref réactif : rien à l'écran n'en dépend.
function loadOrCreatePlayerId() {
  try {
    const stored = localStorage.getItem(PLAYER_ID_KEY)
    if (stored) {
      return stored
    }
    const id = crypto.randomUUID()
    localStorage.setItem(PLAYER_ID_KEY, id)
    return id
  } catch {
    // localStorage indisponible : id valable pour cette session seulement.
    return crypto.randomUUID()
  }
}

export let playerId = loadOrCreatePlayerId()

// Après un lien d'appareil réussi (cf. BurgerMenu.vue "Lier cet appareil" /
// legacyOnline.js completeDeviceLink) : remplace l'identifiant local par
// celui de l'identité liée. Binding ESM vivant — legacyOnline.js (déjà
// importé ailleurs) voit la nouvelle valeur au prochain appel, pas besoin de
// re-import.
export function setPlayerId(id) {
  playerId = id
  try {
    localStorage.setItem(PLAYER_ID_KEY, id)
  } catch {
    // localStorage indisponible : la nouvelle valeur reste bonne pour cette session.
  }
}
