import { ref, computed, onMounted, onUnmounted } from 'vue'

export function useViewportCamera(cellSize) {
  const containerRef = ref(null)
  const containerWidth = ref(0)
  const containerHeight = ref(0)

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

  const cellsAcross = computed(() => Math.max(1, Math.floor(containerWidth.value / cellSize)))
  const cellsDown = computed(() => Math.max(1, Math.floor(containerHeight.value / cellSize)))

  // Partie de cellule qui dépasse à gauche/en haut à cause de l'origine
  // fractionnaire — le décalage en pixels qui rend le drag continu.
  const offsetX = computed(() => (originX.value - Math.floor(originX.value)) * cellSize)
  const offsetY = computed(() => (originY.value - Math.floor(originY.value)) * cellSize)

  function pan(dxPx, dyPx) {
    originX.value += dxPx / cellSize
    originY.value += dyPx / cellSize
  }

  function centerOn(x, y) {
    originX.value = x - cellsAcross.value / 2
    originY.value = y - cellsDown.value / 2
  }

  return {
    containerRef,
    originX,
    originY,
    cellsAcross,
    cellsDown,
    offsetX,
    offsetY,
    pan,
    centerOn
  }
}
