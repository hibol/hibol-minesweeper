import { onScopeDispose } from 'vue'

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

// Déplace le coin de vue (originX/originY de useViewportCamera) vers une cible,
// en cases, de façon animée — boucle requestAnimationFrame + easeOutCubic.
// Un seul tween à la fois : animateOriginTo l'annule d'abord, sinon deux
// boucles rAF concurrentes font dériver origin. cancelOriginTween() rend la
// main à un pan/geste manuel.
export function useOriginTween(originX, originY) {
  let frame = null

  function cancelOriginTween() {
    if (frame !== null) {
      cancelAnimationFrame(frame)
      frame = null
    }
  }

  function animateOriginTo(targetX, targetY, durationMs) {
    cancelOriginTween()

    const startX = originX.value
    const startY = originY.value
    const startTime = performance.now()

    function tick(now) {
      const t = Math.min(1, (now - startTime) / durationMs)
      const eased = easeOutCubic(t)
      originX.value = startX + (targetX - startX) * eased
      originY.value = startY + (targetY - startY) * eased
      frame = t < 1 ? requestAnimationFrame(tick) : null
    }

    frame = requestAnimationFrame(tick)
  }

  // Coupe un tween encore en vol si le composant se démonte.
  onScopeDispose(cancelOriginTween)

  return { animateOriginTo, cancelOriginTween }
}
