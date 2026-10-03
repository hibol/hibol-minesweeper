import { ref, computed, watch, onScopeDispose } from "vue"
import { pushToast } from "../state/toastQueue"
import { ROBOT_PIXELS } from "../icons"
import { nextRobotWalk, stepRobotWalk } from "../game/game"

// Fait avancer les marches de robots au rythme de l'animation : chaque pas est
// joué par le moteur (stepRobotWalk) au moment où le robot arrive sur sa case,
// rien n'est résolu à l'avance. Ici : un seul minuteur pour toutes les marches,
// halo perce-voile, suivi caméra. `deps` = caméra + tween d'App.vue, et
// onStep(changed) / onAllWalksEnd() pour les effets d'un pas (cœurs, carte,
// sauvegarde).
export function useRobotAnimation(game, deps) {
  const {
    originX,
    originY,
    cellSize,
    viewportWidth,
    viewportHeight,
    animateOriginTo,
    cancelOriginTween,
    followTweenMs,
    onStep = () => {},
    onAllWalksEnd = () => {},
  } = deps

  const TOAST_DURATION_MS = 2000 // 2x le défaut de toastQueue.js, explicite
  const FOLLOW_MARGIN = 2
  const FOLLOW_RETURN_DELAY_MS = 500

  // Nombre de marches en cours (pas un booléen) : plusieurs robots d'une même
  // cascade marchent en parallèle, les clics restent bloqués jusqu'au dernier.
  const robotAnimationsActive = ref(0)

  // Position monde de chaque robot en marche, pour son halo perce-voile. Id =
  // celui de la marche (deux robots peuvent partir de cases voisines).
  const haloCells = ref([])

  // monde -> px écran : originX/Y = coin haut-gauche du viewport en cases.
  const robotHaloPositions = computed(() =>
    haloCells.value.map(({ id, x, y }) => ({
      id,
      x: (x - originX.value) * cellSize.value + cellSize.value / 2,
      y: (y - originY.value) * cellSize.value + cellSize.value / 2,
    })),
  )

  const robotHaloRadius = computed(() => cellSize.value * 1.5)

  // Position du viewport au début d'une rafale, restaurée à la fin.
  let preOriginX = null
  let preOriginY = null
  let returnTimeout = null
  // Un seul minuteur : l'ordre des pas vient de l'horloge virtuelle du moteur,
  // pas de l'ordre de déclenchement de plusieurs setInterval.
  let stepTimeout = null

  function cancelPendingRobotReturn() {
    if (returnTimeout !== null) {
      clearTimeout(returnTimeout)
      returnTimeout = null
    }
  }

  function isPointInViewport(x, y) {
    return (
      x >= originX.value &&
      x < originX.value + viewportWidth.value &&
      y >= originY.value &&
      y < originY.value + viewportHeight.value
    )
  }

  // margin plafonné au quart du viewport : pas d'intervalle inversé si très zoomé.
  function clampFollowOrigin(cellCoord, currentOrigin, viewportSizeCells) {
    const margin = Math.min(FOLLOW_MARGIN, Math.floor(viewportSizeCells / 4))
    const leftBound = currentOrigin + margin
    const rightBound = currentOrigin + viewportSizeCells - margin - 1

    if (cellCoord < leftBound) {
      return currentOrigin - (leftBound - cellCoord)
    }
    if (cellCoord > rightBound) {
      return currentOrigin + (cellCoord - rightBound)
    }
    return currentOrigin
  }

  function followRobotIfNeeded(cell) {
    const targetX = clampFollowOrigin(
      cell.x,
      originX.value,
      viewportWidth.value,
    )
    const targetY = clampFollowOrigin(
      cell.y,
      originY.value,
      viewportHeight.value,
    )
    if (targetX === originX.value && targetY === originY.value) {
      return
    }
    // Au plus le délai jusqu'au prochain pas : le tween finit avant d'être
    // relancé. Raccourci (traversée à 120 ms), il est linéaire pour enchaîner.
    const next = nextRobotWalk(game.value)
    const untilNext = next ? next.dueAt - game.value.robotClock : followTweenMs
    const durationMs = Math.min(followTweenMs, untilNext)
    animateOriginTo(targetX, targetY, durationMs, {
      linear: durationMs < followTweenMs,
    })
  }

  // Fin de rafale : ramène la caméra là où elle était avant, si elle a bougé.
  function returnCameraAfterBurst() {
    if (preOriginX === null) {
      return
    }
    // Centre de l'ancien viewport plutôt que son coin brut.
    const wasVisible = isPointInViewport(
      preOriginX + viewportWidth.value / 2,
      preOriginY + viewportHeight.value / 2,
    )
    const targetX = preOriginX
    const targetY = preOriginY
    preOriginX = null
    preOriginY = null

    if (!wasVisible) {
      returnTimeout = setTimeout(() => {
        returnTimeout = null
        animateOriginTo(targetX, targetY, followTweenMs)
      }, FOLLOW_RETURN_DELAY_MS)
    }
  }

  // Applique le résultat d'un pas côté écran : halo, caméra, puis les effets
  // (onStep) une fois le halo en place, pour qu'un cœur atteint soit vu.
  function applyStep({ id, kind, at, changed }) {
    if (kind === "end") {
      pushToast("bop... [end of transmission]", {
        icon: ROBOT_PIXELS,
        durationMs: TOAST_DURATION_MS,
      })
      haloCells.value = haloCells.value.filter((halo) => halo.id !== id)
      robotAnimationsActive.value--
      onStep(changed)
      if (robotAnimationsActive.value === 0) {
        returnCameraAfterBurst()
        onAllWalksEnd()
      }
      return
    }

    const halo = haloCells.value.find((h) => h.id === id)
    if (halo) {
      halo.x = at.x
      halo.y = at.y
    }
    if (robotAnimationsActive.value === 1) {
      followRobotIfNeeded(at)
    }
    onStep(changed)
  }

  // Joue tous les pas dus au même instant virtuel (ordre de démarrage), puis
  // arme le minuteur sur le prochain.
  function runDueSteps() {
    stepTimeout = null
    const current = game.value
    const first = nextRobotWalk(current)
    if (!first) {
      return
    }
    const due = first.dueAt
    let walk = first
    while (walk && walk.dueAt === due) {
      applyStep(stepRobotWalk(current, walk))
      walk = nextRobotWalk(current)
    }
    scheduleNextStep()
  }

  function scheduleNextStep() {
    if (stepTimeout !== null) {
      return
    }
    const walk = nextRobotWalk(game.value)
    if (walk) {
      stepTimeout = setTimeout(runDueSteps, walk.dueAt - game.value.robotClock)
    }
  }

  // Seul point d'entrée : vide game.pendingRobotTrails (marches démarrées par
  // le dernier reveal) et lance le minuteur. Classic/legacy n'ont pas le champ.
  function drainRobotTrails() {
    const trails = game.value.pendingRobotTrails
    if (!trails || trails.length === 0) {
      return
    }
    const drained = trails.splice(0, trails.length)
    for (const { id, x, y } of drained) {
      if (robotAnimationsActive.value === 0) {
        preOriginX = originX.value
        preOriginY = originY.value
      }
      robotAnimationsActive.value++
      haloCells.value.push({ id, x, y })
      pushToast("bip bop... starting exploration", {
        icon: ROBOT_PIXELS,
        durationMs: TOAST_DURATION_MS,
      })
    }
    scheduleNextStep()
  }

  // Coupe les marches à l'écran sans toucher au moteur : la partie remplacée
  // garde ses marches dans sa sauvegarde, terminées à sa restauration.
  function stopWalkTimers() {
    if (stepTimeout !== null) {
      clearTimeout(stepTimeout)
      stepTimeout = null
    }
    robotAnimationsActive.value = 0
    haloCells.value = []
  }

  // flush "sync" : aucun pas ne doit partir sur la nouvelle partie entre son
  // affectation et le prochain flush.
  watch(game, stopWalkTimers, { flush: "sync" })
  onScopeDispose(() => {
    stopWalkTimers()
    cancelPendingRobotReturn()
  })

  // Nouvelle partie : annule tween + retour en attente, oublie la position
  // sauvegardée (plus de sens sur un nouveau monde).
  function resetRobotFollowState() {
    cancelOriginTween()
    cancelPendingRobotReturn()
    preOriginX = null
    preOriginY = null
  }

  return {
    robotAnimationsActive,
    robotHaloPositions,
    robotHaloRadius,
    drainRobotTrails,
    resetRobotFollowState,
    cancelPendingRobotReturn,
  }
}
