import { ref, computed, onMounted, onUnmounted } from "vue"

// Bornes de --cell-size en pixels pendant un pinch-zoom : assez petit pour
// dézoomer largement en infini (jusqu'à la silhouette simplifiée, cf.
// SIMPLIFIED_RENDER_THRESHOLD dans App.vue), assez grand pour ne pas dépasser
// une taille de case confortable au doigt. MIN_CELL_SIZE pilote directement
// le nombre de cases (donc de composants MineCell) rendues au dézoom max sur
// un écran donné — à resserrer si ça rame sur mobile en pratique.
// En infini, zoomBy reçoit un plancher plus bas (niveau carte, cf. useMapView).
export const MIN_CELL_SIZE = 10
export const MAX_CELL_SIZE = 56

// Zoom relu d'une sauvegarde. Sous 1 px reste légitime (vue carte), mais 0,
// NaN, un négatif ou une chaîne casseraient la caméra : zoom de base à la place.
export function restoredCellSize(value, baseCellSize) {
  return Number.isFinite(value) && value > 0
    ? Math.min(MAX_CELL_SIZE, value)
    : baseCellSize
}

export function useViewportCamera(baseCellSize) {
  const containerRef = ref(null)
  const containerWidth = ref(0)
  const containerHeight = ref(0)
  const cellSize = ref(baseCellSize)

  let resizeObserver

  // Coin haut-gauche du conteneur à l'écran, mémorisé : zoomBy en a besoin à
  // chaque événement de pincement, getBoundingClientRect y forcerait un layout.
  let containerLeft = 0
  let containerTop = 0

  function refreshContainerPosition() {
    if (!containerRef.value) {
      return
    }
    const rect = containerRef.value.getBoundingClientRect()
    containerLeft = rect.left
    containerTop = rect.top
  }

  onMounted(() => {
    refreshContainerPosition()
    resizeObserver = new ResizeObserver((entries) => {
      containerWidth.value = entries[0].contentRect.width
      containerHeight.value = entries[0].contentRect.height
      refreshContainerPosition()
    })
    resizeObserver.observe(containerRef.value)
    // Le conteneur peut bouger sans changer de taille (fenêtre, défilement).
    window.addEventListener("resize", refreshContainerPosition)
    window.addEventListener("scroll", refreshContainerPosition, {
      capture: true,
      passive: true,
    })
  })

  onUnmounted(() => {
    resizeObserver.disconnect()
    window.removeEventListener("resize", refreshContainerPosition)
    window.removeEventListener("scroll", refreshContainerPosition, {
      capture: true,
    })
  })

  const originX = ref(0)
  const originY = ref(0)

  const cellsAcross = computed(() =>
    Math.max(1, Math.floor(containerWidth.value / cellSize.value)),
  )
  const cellsDown = computed(() =>
    Math.max(1, Math.floor(containerHeight.value / cellSize.value)),
  )

  // Partie de cellule qui dépasse à gauche/en haut à cause de l'origine
  // fractionnaire — le décalage en pixels qui rend le drag continu.
  const offsetX = computed(
    () => (originX.value - Math.floor(originX.value)) * cellSize.value,
  )
  const offsetY = computed(
    () => (originY.value - Math.floor(originY.value)) * cellSize.value,
  )

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
  // minCellSize : plancher fourni par l'appelant (adaptatif en infini). Un
  // cellSize déjà en dessous (partie restaurée) n'est pas remonté de force.
  function zoomBy(factor, clientX, clientY, minCellSize = MIN_CELL_SIZE) {
    if (!containerRef.value) {
      return
    }

    const focalXPx = clientX - containerLeft
    const focalYPx = clientY - containerTop

    const oldCellSize = cellSize.value
    const floor = Math.min(minCellSize, oldCellSize)
    const newCellSize = Math.min(
      MAX_CELL_SIZE,
      Math.max(floor, oldCellSize * factor),
    )

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
    cellSize.value = Math.min(
      MAX_CELL_SIZE,
      Math.max(MIN_CELL_SIZE, cellSize.value * factor),
    )
  }

  return {
    containerRef,
    containerWidth,
    containerHeight,
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
    resetZoom,
  }
}
