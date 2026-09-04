import { computed } from 'vue'

// Boussole de la chasse au trésor (roadmap point 10). Donne un cap exact et
// une intensité "chaud/froid" du coffre depuis le CENTRE du viewport, en
// coordonnées monde — jamais de distance chiffrée (sinon le mode se résout en
// "avancer de N cases").
//
// game / originX / originY / viewportWidth / viewportHeight sont les refs
// d'App.vue (game + useViewportCamera). On renvoie des refs séparées plutôt
// qu'un objet : destructurées en bindings de premier niveau dans App.vue,
// elles se déballent automatiquement dans le template (ce que ne ferait pas
// `compass.angleDeg` sur un objet nu).
export function useCompass(game, originX, originY, viewportWidth, viewportHeight) {
  const active = computed(
    () => game.value.mode === 'treasure' && game.value.status === 'playing' && !game.value.chestFound
  )

  // dx/dy : du centre du viewport vers le coffre. Court-circuités à 0 hors
  // chasse au trésor pour ne jamais lire game.value.chest quand il n'existe
  // pas (partie classic/infinie).
  const dx = computed(() =>
    active.value ? game.value.chest.x - (originX.value + viewportWidth.value / 2) : 0
  )
  const dy = computed(() =>
    active.value ? game.value.chest.y - (originY.value + viewportHeight.value / 2) : 0
  )

  const distance = computed(() => Math.hypot(dx.value, dy.value))

  // 0° = vers le haut de l'écran, sens horaire (comme une aiguille) :
  // atan2(dx, -dy) donne exactement ça, prêt pour un transform: rotate(Ndeg).
  const angleDeg = computed(() => (Math.atan2(dx.value, -dy.value) * 180) / Math.PI)

  // Chaud/froid : 1 quasiment sur le coffre, 0 au-delà de COLD_DISTANCE.
  // Racine carrée (courbe concave) pour que "ça chauffe" se sente bien avant
  // d'être au but, plutôt qu'un réveil brutal dans les tout derniers pas.
  // Courbe à caler en jouant (cf. roadmap).
  const COLD_DISTANCE = 90

  const warmth = computed(() => {
    if (!active.value) {
      return 0
    }

    return Math.sqrt(Math.max(0, 1 - distance.value / COLD_DISTANCE))
  })

  return { active, angleDeg, warmth }
}
