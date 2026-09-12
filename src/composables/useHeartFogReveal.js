import { ref, watch } from 'vue'

// Un cœur révélé (openCell, game.js) ne doit alléger le voile — et jouer son
// animation de pop (cf. MineCell.vue, cell.heartFogConfirmed) — qu'une fois
// réellement VU : son centre écran doit être tombé, au moins une fois, dans
// la zone du voile non couverte de brouillard (même ellipse que
// useFogOfWar/usePixelFog) ou dans le halo d'un robot en marche. Sans ça, un
// cœur révélé par une grosse cascade hors champ, ou par la marche d'un robot
// pas encore arrivé dessus, compterait avant que le joueur ne l'ait vu.
//
// game.heartsCollectedCount (brut, incrémenté par openCell) reste inchangé —
// HUD, achievements, historique des runs continuent de le lire tel quel.
// Seul confirmedHeartsCount sert d'override à getDarkness/canGiveUp.
//
// confirmedHeartsCount est fourni par l'appelant (App.vue), pas créé ici :
// useFogOfWar() en a besoin AVANT ce composable-ci (il lui faut ses
// clearRadiusX/Y, produits par useFogOfWar), donc le ref doit exister avant
// les deux — muté ici, seulement lu là-bas.
export function useHeartFogReveal(game, {
  originX,
  originY,
  cellSize,
  containerWidth,
  containerHeight,
  clearRadiusX,
  clearRadiusY,
  haloPositions,
  haloRadius,
  confirmedHeartsCount
}) {
  // Cœurs révélés mais pas encore confirmés (en attente de passer dans la
  // zone claire).
  const pending = ref([])

  function cellScreenPos(cell) {
    return {
      x: (cell.x - originX.value) * cellSize.value + cellSize.value / 2,
      y: (cell.y - originY.value) * cellSize.value + cellSize.value / 2
    }
  }

  // Même test que la boucle de dessin de usePixelFog.js (ellipse centrée sur
  // l'écran, union avec les halos de robots) — appliqué à un seul point (le
  // centre d'un cœur) plutôt qu'à chaque pixel du canvas.
  function isCellSeen(cell) {
    const cx = containerWidth.value / 2
    const cy = containerHeight.value / 2
    const { x, y } = cellScreenPos(cell)

    const radX = Math.max(1, clearRadiusX.value)
    const radY = Math.max(1, clearRadiusY.value)
    const dx = (x - cx) / radX
    const dy = (y - cy) / radY
    if (dx * dx + dy * dy <= 1) {
      return true
    }

    const haloRadiusPx = haloRadius.value
    for (const halo of haloPositions.value) {
      const hdx = x - halo.x
      const hdy = y - halo.y
      if (hdx * hdx + hdy * hdy <= haloRadiusPx * haloRadiusPx) {
        return true
      }
    }

    return false
  }

  // Reste des cœurs encore en attente après ce passage — confirme ceux qui
  // viennent de tomber dans la zone claire. Une confirmation élargit le rayon
  // clair (moins de mines effectives) : un autre cœur en attente peut donc se
  // retrouver confirmé dans la foulée, sans nouveau mouvement de caméra —
  // voulu, le voile est vraiment plus léger.
  function recheckPending() {
    if (pending.value.length === 0) {
      return
    }

    pending.value = pending.value.filter((cell) => {
      if (cell.heartFogConfirmed) {
        return false
      }
      if (!isCellSeen(cell)) {
        return true
      }
      cell.heartFogConfirmed = true
      confirmedHeartsCount.value++
      return false
    })
  }

  // Vide game.value.pendingHeartReveals (rempli par openCell, même mécanique
  // que pendingRobotTrails/drainRobotTrails) : à appeler après toute action
  // qui peut révéler des cases (reveal, Travel Machine...).
  function drainPendingHearts() {
    const queue = game.value.pendingHeartReveals
    if (!queue || queue.length === 0) {
      return
    }

    const drained = queue.splice(0, queue.length)
    for (const cell of drained) {
      if (!cell.heartFogConfirmed) {
        pending.value.push(cell)
      }
    }
    recheckPending()
  }

  // Reconstruit l'état depuis `game` : nouvelle partie (rien à faire, aucun
  // cœur) ou reprise (recompte les cœurs déjà confirmés avant la mise en
  // arrière-plan, remet en attente ceux qui ne l'étaient pas encore — seule
  // source de vérité : le flag persisté par case, pas un compteur à part).
  function resetFromGame() {
    pending.value = []
    let count = 0

    for (const cell of game.value.cells.values()) {
      if (!cell.isHeart || !cell.revealed) {
        continue
      }
      if (cell.heartFogConfirmed) {
        count++
      } else {
        pending.value.push(cell)
      }
    }

    confirmedHeartsCount.value = count

    // Ce scan couvre déjà tout cœur révélé jusqu'ici (y compris l'ouverture
    // initiale d'une partie neuve, résolue avant que game.value ne soit
    // affecté) : vide la file pour éviter qu'un drainPendingHearts() plus
    // tard n'y retrouve les mêmes cases et les remette en double dans
    // `pending`.
    game.value.pendingHeartReveals?.splice(0)

    recheckPending()
  }

  watch(game, resetFromGame, { immediate: true })
  watch([originX, originY, cellSize, clearRadiusX, clearRadiusY, haloPositions], recheckPending)

  return { drainPendingHearts }
}
