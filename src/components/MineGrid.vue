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
  }

  if (didDrag && (deltaX !== 0 || deltaY !== 0)) {
    emit('pan', -deltaX, -deltaY)
  }
}

function onPointerUp() {
  dragging = false
}

function onCellClick(cell) {
  if (didDrag) {
    return
  }

  emit('click', cell)
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
      @flag="$emit('flag', cell)"
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
  border: 2px solid #333;
  width: fit-content;
}
</style>