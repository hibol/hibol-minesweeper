import { ref } from "vue"

// Journal de coups (Legacy uniquement pour l'instant) : { t, type, x, y }[].
// `t` exclut le temps en pause (même modèle accumMs/runningSince que
// useRunTimer), mais démarre sur le tout 1er record() — drapeau ou reveal,
// cf. App.vue performToggleFlag — pas sur un start() externe comme legacyTimer
// (qui lui n'engage qu'au 1er reveal) : ce sont deux horloges à ancrages
// différents, volontairement pas fusionnées.
export function useMoveLog() {
  const moves = ref([])
  let accumMs = 0
  let runningSince = null

  function record(type, { x, y }) {
    const now = performance.now()
    if (moves.value.length === 0) {
      runningSince = now
    }
    const live = runningSince !== null ? now - runningSince : 0
    moves.value.push({ t: accumMs + live, type, x, y })
  }

  function pause() {
    if (runningSince === null) {
      return
    }
    accumMs += performance.now() - runningSince
    runningSince = null
  }

  // Inerte tant qu'aucun coup n'a encore été joué (le prochain record() posera
  // lui-même l'ancre) — symétrique au `started` de useRunTimer.
  function resume() {
    if (runningSince !== null || moves.value.length === 0) {
      return
    }
    runningSince = performance.now()
  }

  function reset() {
    moves.value = []
    accumMs = 0
    runningSince = null
  }

  // Reprise d'une partie sauvegardée : restaure le journal tel quel et reprend
  // l'accumulation depuis le `t` du dernier coup. Reste en pause — un resume()
  // explicite le relance (cf. App.vue resumeGame, symétrique à legacyTimer.restore).
  function restore(savedMoves) {
    moves.value = Array.isArray(savedMoves) ? savedMoves : []
    accumMs =
      moves.value.length > 0 ? moves.value[moves.value.length - 1].t : 0
    runningSince = null
  }

  return { moves, record, pause, resume, reset, restore }
}
