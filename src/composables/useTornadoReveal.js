import { ref, watch } from "vue"
import { triggerTornado } from "../game/game"

// Chasse au trésor : pas de brouillard (contrairement à useHeartFogReveal.js
// en infini), donc "vu" se réduit au rectangle du viewport courant — même
// bornes que getVisibleCells (game.js), pas une ellipse de voile ni un halo.
// Une tornade révélée par une cascade hors champ ne doit relocaliser le
// coffre (et faire tourner la boussole) qu'une fois effectivement affichée à
// l'écran, sinon le joueur voit le coffre bouger sans cause visible — même
// principe que les cœurs en infini, en plus simple.
export function useTornadoReveal(
  game,
  { originX, originY, viewportWidth, viewportHeight },
) {
  // Tornades révélées mais pas encore confirmées (en attente de passer dans
  // le viewport).
  const pending = ref([])

  function isCellVisible(cell) {
    return (
      cell.x >= originX.value &&
      cell.x < originX.value + viewportWidth.value &&
      cell.y >= originY.value &&
      cell.y < originY.value + viewportHeight.value
    )
  }

  // Reste des tornades encore en attente après ce passage — déclenche celles
  // qui viennent de tomber dans le viewport.
  function recheckPending() {
    if (pending.value.length === 0) {
      return
    }

    pending.value = pending.value.filter((cell) => {
      if (cell.tornadoTriggered) {
        return false
      }
      if (!isCellVisible(cell)) {
        return true
      }
      triggerTornado(game.value, cell)
      return false
    })
  }

  // Vide game.value.pendingTornadoReveals (rempli par openCell, même
  // mécanique que pendingHeartReveals) : à appeler après toute action qui
  // peut révéler des cases (reveal).
  function drainPendingTornadoes() {
    const queue = game.value.pendingTornadoReveals
    if (!queue || queue.length === 0) {
      return
    }

    const drained = queue.splice(0, queue.length)
    for (const cell of drained) {
      if (!cell.tornadoTriggered) {
        pending.value.push(cell)
      }
    }
    recheckPending()
  }

  // Reconstruit l'état depuis `game` : nouvelle partie (rien à faire) ou
  // reprise (remet en attente les tornades révélées mais pas encore
  // déclenchées avant la mise en arrière-plan — seule source de vérité : le
  // flag persisté par case, pas une file à part).
  function resetFromGame() {
    pending.value = []

    for (const cell of game.value.cells.values()) {
      if (cell.isTornado && cell.revealed && !cell.tornadoTriggered) {
        pending.value.push(cell)
      }
    }

    game.value.pendingTornadoReveals?.splice(0)

    recheckPending()
  }

  // flush: "sync" pour la même raison que useHeartFogReveal.js : un resume
  // (App.vue) affecte game.value puis agit dans la foulée sans attendre un
  // tick — le flush par défaut ("pre") laisserait une tornade pourtant déjà
  // visible à la reprise sans effet jusqu'au prochain changement réel.
  watch(game, resetFromGame, { immediate: true, flush: "sync" })
  watch([originX, originY, viewportWidth, viewportHeight], recheckPending)

  return { drainPendingTornadoes }
}
