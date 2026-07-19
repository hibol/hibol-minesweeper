<script setup>
import MineCell from './MineCell.vue'

defineProps({
  cells: Array,
  width: Number,
  seamless: Boolean,
  offsetX: {
    type: Number,
    default: 0
  },
  offsetY: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['click', 'flag', 'pan'])

// En dessous de cette distance cumulée, un mousedown+mouseup est traité comme
// un clic (léger tremblement de la main toléré), au-dessus comme un drag.
const DRAG_THRESHOLD = 8

let dragging = false
let didDrag = false
let startX = 0
let startY = 0
let downX = 0
let downY = 0

// Durée d'un appui long avant qu'il équivaille à un clic droit (flag/reveal
// selon le réglage) — nécessaire car `contextmenu` sur un appui long n'est
// pas fiable sur tous les navigateurs mobiles (ex. iOS Safari).
const LONG_PRESS_MS = 500

let longPressTimer = null
// Vrai dès que l'action "opposée" (flag/reveal) a été déclenchée pour cet
// appui, que ce soit par notre timer ou par un `contextmenu` natif arrivé en
// même temps (Android le déclenche déjà tout seul sur un appui long) — évite
// de déclencher l'action deux fois, et empêche le clic normal de suivre.
let longPressHandled = false

function clearLongPress() {
  clearTimeout(longPressTimer)
  longPressTimer = null
}

function onPointerDown(event) {
  dragging = true
  didDrag = false
  startX = event.clientX
  startY = event.clientY
  downX = event.clientX
  downY = event.clientY
}

function onPointerMove(event) {
  if (!dragging) {
    return
  }

  const deltaX = event.clientX - startX
  const deltaY = event.clientY - startY
  startX = event.clientX
  startY = event.clientY

  if (!didDrag && Math.hypot(event.clientX - downX, event.clientY - downY) > DRAG_THRESHOLD) {
    didDrag = true
    clearLongPress()
  }

  if (didDrag && (deltaX !== 0 || deltaY !== 0)) {
    emit('pan', -deltaX, -deltaY)
  }
}

function onPointerUp() {
  dragging = false
  clearLongPress()
}

function onCellPressStart(cell) {
  longPressHandled = false
  clearLongPress()
  longPressTimer = setTimeout(() => {
    if (!didDrag && !longPressHandled) {
      longPressHandled = true
      emit('flag', cell)
    }
  }, LONG_PRESS_MS)
}

function onCellClick(cell) {
  if (didDrag || longPressHandled) {
    return
  }

  emit('click', cell)
}

function onCellFlag(cell) {
  if (longPressHandled) {
    return
  }

  longPressHandled = true
  clearLongPress()
  emit('flag', cell)
}
</script>

<template>
  <div
    class="grid"
    :class="{ seamless }"
    :style="{
      '--columns': width,
      transform: `translate(${-offsetX}px, ${-offsetY}px)`
    }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointerleave="onPointerUp"
  >
    <MineCell
      v-for="cell in cells"
      :key="`${cell.x}-${cell.y}`"
      :cell="cell"
      :seamless="seamless"
      @click="onCellClick(cell)"
      @flag="onCellFlag(cell)"
      @press-start="onCellPressStart(cell)"
    />
  </div>
</template>

<style scoped>

.grid.seamless {
  border: none;
}

.grid {
  display: grid;
  grid-template-columns: repeat(var(--columns), var(--cell-size));
  touch-action: none;
  border: 2px solid var(--color-chrome-border);
  width: fit-content;
}
</style>