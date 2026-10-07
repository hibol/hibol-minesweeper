import { ref, computed } from "vue"
import { peekActiveGame } from "../state/gameStorage"

// Confirmation avant d'écraser une partie par une partie neuve. ask() met la
// demande en attente (le dialogue s'ouvre sur `pendingStart`), confirm() la
// lance via `startNewGame(mode, params)`, cancel() l'abandonne.
export function usePendingStart(game, { startNewGame }) {
  const pendingStart = ref(null) // { mode, params } | null

  // Nombre de cases de la partie que la confirmation s'apprête à écraser —
  // celle à l'écran si c'est le même mode, sinon celle en pause dans le slot
  // cible.
  const pendingDiscardCount = computed(() => {
    const pending = pendingStart.value
    if (!pending) {
      return 0
    }
    if (game.value.mode === pending.mode) {
      return game.value.revealedCount
    }
    return peekActiveGame(pending.mode)?.revealedCount ?? 0
  })

  // « explored » n'a de sens qu'en infini ; ailleurs, des cases révélées.
  const pendingDiscardMessage = computed(() => {
    const verb =
      pendingStart.value?.mode === "infinite" ? "explored" : "revealed"
    return `${pendingDiscardCount.value} cells ${verb} will be lost`
  })

  function ask(mode, params) {
    pendingStart.value = { mode, params }
  }

  function confirm() {
    const pending = pendingStart.value
    pendingStart.value = null

    if (pending) {
      startNewGame(pending.mode, pending.params)
    }
  }

  function cancel() {
    pendingStart.value = null
  }

  return { pendingStart, pendingDiscardMessage, ask, confirm, cancel }
}
