import { ref, computed } from 'vue'
import { pushToast } from '../toastQueue'
import { ROBOT_PIXELS } from '../icons'

// Rejoue visuellement la marche d'un robot : game.js a déjà tout résolu d'un
// coup (performRobotWalk). Ici on avance le sprite (cell.robotHere) case par
// case avec un décalage, on démasque (cell.pendingReveal) à mesure, on perce le
// voile avec un halo, et on fait suivre la caméra si le robot sort du viewport.
// `deps` = caméra + tween d'App.vue.
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
  } = deps

  const STEP_DELAY_MS = 440
  const TOAST_DURATION_MS = 2000 // 2x le défaut de toastQueue.js, explicite
  const FOLLOW_MARGIN = 2
  const FOLLOW_RETURN_DELAY_MS = 500

  // Compteur (pas booléen) : plusieurs robots d'une même cascade animent en
  // parallèle, les clics restent bloqués tant qu'il en reste au moins un.
  const robotAnimationsActive = ref(0)

  // Coordonnées monde des robots en marche, un par animation — positionne leur
  // halo perce-voile. Id par animation (deux robots peuvent partir de la même
  // case dans une cascade).
  let nextHaloId = 0
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
    const targetX = clampFollowOrigin(cell.x, originX.value, viewportWidth.value)
    const targetY = clampFollowOrigin(cell.y, originY.value, viewportHeight.value)
    if (targetX !== originX.value || targetY !== originY.value) {
      animateOriginTo(targetX, targetY, followTweenMs)
    }
  }

  function animateRobotTrail(origin, steps) {
    if (robotAnimationsActive.value === 0) {
      preOriginX = originX.value
      preOriginY = originY.value
    }

    robotAnimationsActive.value++
    pushToast('bip bop... starting exploration', { icon: ROBOT_PIXELS, durationMs: TOAST_DURATION_MS })

    // path[i>=1] = steps[i-1].lead (origin préfixé).
    const path = [origin, ...steps.map((s) => s.lead)]

    // Tout masqué d'entrée (case foulée + poche de sa cascade), démasqué par
    // groupe quand le robot y arrive.
    for (const { lead, opened } of steps) {
      lead.pendingReveal = true
      for (const cell of opened) {
        cell.pendingReveal = true
      }
    }

    path[0].robotHere = true

    const haloId = nextHaloId++
    haloCells.value.push({ id: haloId, x: path[0].x, y: path[0].y })

    let index = 0
    const interval = setInterval(() => {
      path[index].robotHere = false
      index++

      if (index >= path.length) {
        clearInterval(interval)
        pushToast('bop... [end of transmission]', { icon: ROBOT_PIXELS, durationMs: TOAST_DURATION_MS })
        robotAnimationsActive.value--
        haloCells.value = haloCells.value.filter((halo) => halo.id !== haloId)

        if (robotAnimationsActive.value === 0 && preOriginX !== null) {
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
        return
      }

      // Démasque la case atteinte + toute la poche ouverte par ce pas.
      path[index].pendingReveal = false
      for (const cell of steps[index - 1].opened) {
        cell.pendingReveal = false
      }
      path[index].robotHere = true

      if (robotAnimationsActive.value === 1) {
        followRobotIfNeeded(path[index])
      }

      const halo = haloCells.value.find((h) => h.id === haloId)
      halo.x = path[index].x
      halo.y = path[index].y
    }, STEP_DELAY_MS)
  }

  // Seul point d'entrée : vide game.pendingRobotTrails et lance une animation
  // par traînée. Appelé après chaque reveal (classic/legacy n'ont pas le champ).
  function drainRobotTrails() {
    const trails = game.value.pendingRobotTrails
    if (!trails || trails.length === 0) {
      return
    }
    const drained = trails.splice(0, trails.length)
    for (const { origin, steps } of drained) {
      animateRobotTrail(origin, steps)
    }
  }

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
