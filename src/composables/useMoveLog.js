import { ref } from "vue"

// Journal de coups (Legacy uniquement pour l'instant) : { t, type, x, y }[],
// t relatif à performance.now() du tout premier coup enregistré après un
// reset() — jamais un Date.now() absolu (pas d'horloge système exposée au
// rejeu serveur).
export function useMoveLog() {
  const moves = ref([])
  let firstMoveAt = null

  function record(type, { x, y }) {
    const now = performance.now()
    if (firstMoveAt === null) {
      firstMoveAt = now
    }
    moves.value.push({ t: now - firstMoveAt, type, x, y })
  }

  function reset() {
    moves.value = []
    firstMoveAt = null
  }

  return { moves, record, reset }
}
