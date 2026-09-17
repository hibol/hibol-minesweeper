import { ref, watch, onScopeDispose } from "vue"

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

// Durée mini (petit ajustement, ex. un cran de mine) / maxi (traversée
// complète du voile, ex. Wind Machine qui dissipe un voile au maximum) —
// interpolées sur l'écart de `darkness` (0..1, cf. useFogOfWar.js) plutôt
// qu'une durée fixe : sinon un gros changement passe pour un simple pop plus
// lent, à peine perceptible. Tunables à l'œil.
const MIN_FOG_TWEEN_MS = 150
const MAX_FOG_TWEEN_MS = 900

// Anime clearRadiusX/clearRadiusY (useFogOfWar.js) vers leur nouvelle valeur
// au lieu du saut instantané — même mécanique que useOriginTween.js (rAF +
// easeOutCubic, un seul tween à la fois). Contrairement à ce dernier,
// déclenché ICI par un watch interne sur la cible : le rayon du voile change
// pour de nombreuses raisons non corrélées (mine, cœur, vent, fin de
// partie...), pas sur un événement discret unique comme un mouvement de
// caméra.
//
// `darkness` (cf. useFogOfWar.js) sert à deux choses :
//  - décider durée de l'animation (cf. constantes ci-dessus) ;
//  - décider s'il faut animer DU TOUT. clearRadiusX/Y dépendent aussi du zoom
//    et de la taille du conteneur (cellSize, viewportWidth/Height) — un zoom
//    ou un redimensionnement de fenêtre fait donc bouger la cible SANS que
//    darkness change. Dans ce cas, aucune animation : le voile doit coller
//    instantanément au geste de zoom, pas suivre sa propre temporalité.
export function useFogRadiusTween(targetRadiusX, targetRadiusY, darkness) {
  const radiusX = ref(targetRadiusX.value)
  const radiusY = ref(targetRadiusY.value)
  let frame = null
  let lastDarkness = darkness.value

  function cancelTween() {
    if (frame !== null) {
      cancelAnimationFrame(frame)
      frame = null
    }
  }

  function animateTo(tx, ty, durationMs) {
    cancelTween()

    const startX = radiusX.value
    const startY = radiusY.value
    const startTime = performance.now()

    function tick(now) {
      const t = Math.min(1, (now - startTime) / durationMs)
      const eased = easeOutCubic(t)
      radiusX.value = startX + (tx - startX) * eased
      radiusY.value = startY + (ty - startY) * eased
      frame = t < 1 ? requestAnimationFrame(tick) : null
    }

    frame = requestAnimationFrame(tick)
  }

  // À appeler après un remplacement de `game` (nouvelle partie / reprise) :
  // la cible peut avoir radicalement changé sans lien avec l'état affiché
  // avant coup — pas question d'animer un "voyage" entre deux parties.
  // Resynchronise aussi lastDarkness, sinon le premier vrai changement
  // suivant la reprise calculerait son delta contre une valeur périmée.
  function snapToTarget() {
    cancelTween()
    radiusX.value = targetRadiusX.value
    radiusY.value = targetRadiusY.value
    lastDarkness = darkness.value
  }

  watch([targetRadiusX, targetRadiusY], ([tx, ty]) => {
    const currentDarkness = darkness.value
    const darknessDelta = Math.abs(currentDarkness - lastDarkness)

    if (darknessDelta === 0) {
      // La cible a bougé pour une autre raison que l'état de la partie
      // (zoom, resize) : suit le geste tout de suite, jamais d'animation.
      snapToTarget()
      return
    }

    lastDarkness = currentDarkness
    const durationMs =
      MIN_FOG_TWEEN_MS + darknessDelta * (MAX_FOG_TWEEN_MS - MIN_FOG_TWEEN_MS)
    animateTo(tx, ty, durationMs)
  })

  onScopeDispose(cancelTween)

  return { radiusX, radiusY, snapToTarget }
}
