<script setup>
import { ref, computed, watch, toRaw, onMounted, onBeforeUnmount } from "vue"
import { theme } from "../state/settings"
import {
  MAP_COLOR,
  MAP_COLOR_VARS,
  buildBaseLayer,
  downsampleLayer,
  layerToRgba,
  parseHexColor,
  pyramidLevelFor,
} from "../mapRender"

// Niveau carte (cf. useMapView) : la zone explorée en une image, un pixel par
// case, posée en un seul drawImage. Remplace MineGrid sous MAP_LEVEL_THRESHOLD.

// Pendant la marche d'un robot, la carte change à chaque pas : on ne
// reconstruit pas l'image plus souvent que ça.
const REBUILD_MIN_INTERVAL_MS = 200

// Demi-largeur réservée au libellé d'aide pour le garder dans l'écran.
const HINT_HALF_WIDTH = 90

const props = defineProps({
  cells: Map, // game.cells (Map réactive), lue via toRaw
  bounds: Object, // useMapView.mapBounds : nouvel objet quand la carte change
  originX: Number,
  originY: Number,
  cellSize: Number,
  width: Number,
  height: Number,
  targetRect: Object, // useMapView.targetRect, ou null
  // Instance de usePointerGestures créée par App.vue, partagée avec MineGrid.
  gestures: Object,
})

const emit = defineEmits(["cancel-target"])

const canvasRef = ref(null)

// Variables simples, pas des ref : des Mo de pixels n'ont rien à faire dans
// le système réactif, et le template ne les affiche pas.
let levels = [] // pyramide : [{ layer, canvas }], levels[0] = image de base
let palette = null
let dirty = true
let lastBuildAt = -Infinity
let frame = null

// Un <canvas> ne comprend pas var() : couleurs du thème résolues une fois.
function resolvePalette() {
  const style = getComputedStyle(document.documentElement)
  const result = []
  result[MAP_COLOR.EMPTY] = [0, 0, 0, 0]
  for (const [color, cssVar] of Object.entries(MAP_COLOR_VARS)) {
    result[color] = parseHexColor(style.getPropertyValue(cssVar))
  }
  return result
}

// Canvas hors écran de la taille de la couche (un pixel = un pixel de couche).
function layerToCanvas(layer) {
  const canvas = document.createElement("canvas")
  canvas.width = layer.width
  canvas.height = layer.height
  palette ??= resolvePalette()
  const image = new ImageData(
    layerToRgba(layer, palette),
    layer.width,
    layer.height,
  )
  canvas.getContext("2d").putImageData(image, 0, 0)
  return canvas
}

function rebuild() {
  levels = props.bounds
    ? [
        {
          layer: buildBaseLayer(toRaw(props.cells), props.bounds),
          canvas: null,
        },
      ]
    : []
  dirty = false
  lastBuildAt = performance.now()
}

// Paliers construits à la demande, puis gardés jusqu'au prochain rebuild.
function levelAt(k) {
  while (levels.length <= k) {
    const prev = levels[levels.length - 1].layer
    if (prev.width === 1 && prev.height === 1) {
      break
    }
    levels.push({ layer: downsampleLayer(prev), canvas: null })
  }
  const level = levels[Math.min(k, levels.length - 1)]
  if (!level.canvas) {
    level.canvas = layerToCanvas(level.layer)
  }
  return level
}

function draw() {
  frame = null
  const canvas = canvasRef.value
  if (!canvas) {
    return
  }

  if (dirty) {
    if (
      levels.length === 0 ||
      performance.now() - lastBuildAt >= REBUILD_MIN_INTERVAL_MS
    ) {
      rebuild()
    } else {
      scheduleDraw()
    }
  }

  const dpr = window.devicePixelRatio || 1
  const w = Math.max(1, Math.round(props.width * dpr))
  const h = Math.max(1, Math.round(props.height * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }

  const ctx = canvas.getContext("2d")
  ctx.clearRect(0, 0, w, h)
  if (levels.length === 0) {
    return
  }

  // Pixels physiques par case : c'est ce qui décide du palier.
  const scale = props.cellSize * dpr
  const base = levels[0].layer
  const { layer, canvas: image } = levelAt(
    pyramidLevelFor(scale, base.cellsPerPixel),
  )
  const cpp = layer.cellsPerPixel

  // Ne copie que la partie de la couche qui tombe dans l'écran.
  const sx0 = Math.max(0, Math.floor((props.originX - layer.x) / cpp))
  const sy0 = Math.max(0, Math.floor((props.originY - layer.y) / cpp))
  const sx1 = Math.min(
    layer.width,
    Math.ceil((props.originX + w / scale - layer.x) / cpp),
  )
  const sy1 = Math.min(
    layer.height,
    Math.ceil((props.originY + h / scale - layer.y) / cpp),
  )
  if (sx1 <= sx0 || sy1 <= sy0) {
    return
  }

  ctx.imageSmoothingEnabled = false
  ctx.drawImage(
    image,
    sx0,
    sy0,
    sx1 - sx0,
    sy1 - sy0,
    (layer.x + sx0 * cpp - props.originX) * scale,
    (layer.y + sy0 * cpp - props.originY) * scale,
    (sx1 - sx0) * cpp * scale,
    (sy1 - sy0) * cpp * scale,
  )
}

// Au plus un dessin par frame, quel que soit le nombre d'événements de
// pan/pincement reçus entre-temps.
function scheduleDraw() {
  if (frame === null) {
    frame = requestAnimationFrame(draw)
  }
}

watch(
  () => props.bounds,
  () => {
    dirty = true
    scheduleDraw()
  },
)

// Les indices de couleur restent valides, seuls les canvas sont à refaire.
watch(theme, () => {
  palette = null
  for (const level of levels) {
    level.canvas = null
  }
  scheduleDraw()
})

watch(
  () => [
    props.originX,
    props.originY,
    props.cellSize,
    props.width,
    props.height,
  ],
  scheduleDraw,
)

// Échap (et le retour Android, qui le simule) annule la cible. Sur window,
// comme BurgerMenu : un dialogue ouvert (écouté sur document) passe avant.
function onKeydown(event) {
  if (event.key !== "Escape" || event.defaultPrevented || !props.targetRect) {
    return
  }
  event.preventDefault()
  emit("cancel-target")
}

onMounted(() => {
  scheduleDraw()
  window.addEventListener("keydown", onKeydown)
})

onBeforeUnmount(() => {
  if (frame !== null) {
    cancelAnimationFrame(frame)
  }
  window.removeEventListener("keydown", onKeydown)
  levels = []
})

const hintStyle = computed(() => {
  const r = props.targetRect
  if (!r) {
    return null
  }
  const x = Math.min(
    Math.max(r.left + r.width / 2, HINT_HALF_WIDTH),
    props.width - HINT_HALF_WIDTH,
  )
  const below = r.top + r.height + 8
  const y = below + 32 > props.height ? Math.max(8, r.top - 36) : below
  return { left: `${x}px`, top: `${y}px` }
})
</script>

<template>
  <div
    class="map-view"
    @pointerdown="gestures.onPointerDown"
    @pointermove="gestures.onPointerMove"
    @pointerup="gestures.onPointerUp"
    @pointerleave="gestures.onPointerUp"
    @pointercancel="gestures.onPointerUp"
    @wheel.prevent="gestures.onWheel"
    @contextmenu.prevent
  >
    <canvas
      ref="canvasRef"
      class="map-canvas"
      :style="{ width: `${width}px`, height: `${height}px` }"
    ></canvas>

    <template v-if="targetRect">
      <div
        class="map-crosshair map-crosshair-h"
        :style="{ top: `${targetRect.centerY}px` }"
      ></div>
      <div
        class="map-crosshair map-crosshair-v"
        :style="{ left: `${targetRect.centerX}px` }"
      ></div>
      <div
        class="map-target"
        :style="{
          left: `${targetRect.left}px`,
          top: `${targetRect.top}px`,
          width: `${targetRect.width}px`,
          height: `${targetRect.height}px`,
        }"
      ></div>
      <div class="map-target-hint" :style="hintStyle">
        Tap again to go there
      </div>
    </template>
  </div>
</template>

<style scoped>
.map-view {
  position: absolute;
  inset: 0;
  overflow: hidden;
  touch-action: none;
}

.map-canvas {
  position: absolute;
  left: 0;
  top: 0;
  display: block;
}

/* z-index 1 : au-dessus du voile (canvas sans z-index plus loin dans
   .game-area), sous les boutons et bannières. Jamais de pointer-events :
   tous les taps vont à .map-view. */
.map-crosshair,
.map-target,
.map-target-hint {
  position: absolute;
  z-index: 1;
  pointer-events: none;
}

.map-crosshair {
  background: var(--color-text);
  opacity: 0.5;
}

.map-crosshair-h {
  left: 0;
  right: 0;
  height: 1px;
}

.map-crosshair-v {
  top: 0;
  bottom: 0;
  width: 1px;
}

/* min-* : reste un repère visible même quand la zone ne fait qu'1-2 px. */
.map-target {
  box-sizing: border-box;
  min-width: 4px;
  min-height: 4px;
  border: 2px solid var(--color-text);
}

.map-target-hint {
  transform: translateX(-50%);
  white-space: nowrap;
  font-family: "VT323", monospace;
  font-size: 16px;
  letter-spacing: 1px;
  color: var(--color-text-strong);
  background: var(--color-panel-bg);
  border: 2px solid var(--color-chrome-border);
  padding: 2px 8px;
}
</style>
