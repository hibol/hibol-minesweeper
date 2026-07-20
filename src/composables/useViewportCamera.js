import { ref, computed, onMounted, onUnmounted } from 'vue'

// Bornes de --cell-size en pixels pendant un pinch-zoom : assez petit pour
// dézoomer largement en infini (jusqu'à la silhouette simplifiée, cf.
// SIMPLIFIED_RENDER_THRESHOLD dans App.vue), assez grand pour ne pas dépasser
// une taille de case confortable au doigt. MIN_CELL_SIZE pilote directement
// le nombre de cases (donc de composants MineCell) rendues au dézoom max sur
// un écran donné — à resserrer si ça rame sur mobile en pratique.
const MIN_CELL_SIZE = 10
const MAX_CELL_SIZE = 56

export function useViewportCamera(baseCellSize) {
  const containerRef = ref(null)
  const containerWidth = ref(0)
  const containerHeight = ref(0)
  const cellSize = ref(baseCellSize)

  let resizeObserver

  onMounted(() => {
    resizeObserver = new ResizeObserver((entries) => {
      containerWidth.value = entries[0].contentRect.width
      containerHeight.value = entries[0].contentRect.height
    })
    resizeObserver.observe(containerRef.value)
  })

  onUnmounted(() => {
    resizeObserver.disconnect()
  })

  const originX = ref(0)
  const originY = ref(0)

  const cellsAcross = computed(() => Math.max(1, Math.floor(containerWidth.value / cellSize.value)))
  const cellsDown = computed(() => Math.max(1, Math.floor(containerHeight.value / cellSize.value)))

  // Partie de cellule qui dépasse à gauche/en haut à cause de l'origine
  // fractionnaire — le décalage en pixels qui rend le drag continu.
  const offsetX = computed(() => (originX.value - Math.floor(originX.value)) * cellSize.value)
  const offsetY = computed(() => (originY.value - Math.floor(originY.value)) * cellSize.value)

  function pan(dxPx, dyPx) {
    originX.value += dxPx / cellSize.value
    originY.value += dyPx / cellSize.value
  }

  function centerOn(x, y) {
    originX.value = x - cellsAcross.value / 2
    originY.value = y - cellsDown.value / 2
  }

  // Zoome autour d'un point fixe en coordonnées écran (le milieu du
  // pincement) : le monde sous ce point ne doit pas visuellement bouger
  // pendant le zoom, donc on recalcule origin après coup pour compenser le
  // changement de cellSize — sinon le zoom se ferait toujours depuis le
  // coin haut-gauche du viewport.
  function zoomBy(factor, clientX, clientY) {
    if (!containerRef.value) {
      return
    }

    const rect = containerRef.value.getBoundingClientRect()
    const focalXPx = clientX - rect.left
    const focalYPx = clientY - rect.top

    const oldCellSize = cellSize.value
    const newCellSize = Math.min(MAX_CELL_SIZE, Math.max(MIN_CELL_SIZE, oldCellSize * factor))

    if (newCellSize === oldCellSize) {
      return
    }

    const worldX = originX.value + focalXPx / oldCellSize
    const worldY = originY.value + focalYPx / oldCellSize

    cellSize.value = newCellSize
    originX.value = worldX - focalXPx / newCellSize
    originY.value = worldY - focalYPx / newCellSize
  }

  function resetZoom() {
    cellSize.value = baseCellSize
  }

  // Variante sans compensation d'origine, pour le classic : la grille y est
  // de taille fixe et centrée par le flex du conteneur (pas alignée sur son
  // coin haut-gauche comme en infini), donc le calcul du point focal de
  // zoomBy — qui suppose cette correspondance — y est faux et fait dériver
  // originX/Y de façon erratique à chaque pas de pinch (cf. bug shaky sur
  // mobile). Le classic n'a de toute façon pas de notion de pan à préserver :
  // changer juste cellSize suffit, le flex recentre tout seul.
  function zoomCellSize(factor) {
    cellSize.value = Math.min(MAX_CELL_SIZE, Math.max(MIN_CELL_SIZE, cellSize.value * factor))
  }

  return {
    containerRef,
    originX,
    originY,
    cellSize,
    cellsAcross,
    cellsDown,
    offsetX,
    offsetY,
    pan,
    centerOn,
    zoomBy,
    zoomCellSize,
    resetZoom
  }
}
