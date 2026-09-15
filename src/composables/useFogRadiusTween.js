import { ref, watch, onScopeDispose } from "vue"

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

// Tunable à l'oreille/à l'œil, comme les autres constantes de tuning du
// voile (cf. useFogOfWar.js, usePixelFog.js).
const FOG_RADIUS_TWEEN_MS = 400

// Anime clearRadiusX/clearRadiusY (useFogOfWar.js) vers leur nouvelle valeur
// au lieu du saut instantané — même mécanique que useOriginTween.js (rAF +
// easeOutCubic, un seul tween à la fois). Contrairement à ce dernier,
// déclenché ICI par un watch interne sur la cible : le rayon du voile change
// pour de nombreuses raisons non corrélées (mine, cœur, vent, fin de
// partie...), pas sur un événement discret unique comme un mouvement de
// caméra.
export function useFogRadiusTween(targetRadiusX, targetRadiusY) {
  const radiusX = ref(targetRadiusX.value)
  const radiusY = ref(targetRadiusY.value)
  let frame = null

  function cancelTween() {
    if (frame !== null) {
      cancelAnimationFrame(frame)
      frame = null
    }
  }

  function animateTo(tx, ty) {
    cancelTween()

    const startX = radiusX.value
    const startY = radiusY.value
    const startTime = performance.now()

    function tick(now) {
      const t = Math.min(1, (now - startTime) / FOG_RADIUS_TWEEN_MS)
      const eased = easeOutCubic(t)
      radiusX.value = startX + (tx - startX) * eased
      radiusY.value = startY + (ty - startY) * eased
      frame = t < 1 ? requestAnimationFrame(tick) : null
    }

    frame = requestAnimationFrame(tick)
  }

  watch([targetRadiusX, targetRadiusY], ([tx, ty]) => animateTo(tx, ty))

  // À appeler après un remplacement de `game` (nouvelle partie / reprise) :
  // la cible peut avoir radicalement changé sans lien avec l'état affiché
  // avant coup — pas question d'animer un "voyage" entre deux parties.
  function snapToTarget() {
    cancelTween()
    radiusX.value = targetRadiusX.value
    radiusY.value = targetRadiusY.value
  }

  onScopeDispose(cancelTween)

  return { radiusX, radiusY, snapToTarget }
}
