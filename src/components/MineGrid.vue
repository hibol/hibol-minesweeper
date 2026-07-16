<script setup>
import { ref } from 'vue'
import MineCell from './MineCell.vue'

defineProps({
  cells: Array,
  width: Number,
  seamless: Boolean
})

const emit = defineEmits(['click', 'flag', 'pan'])

const CELL_SIZE = 28 // doit correspondre à --cell-size en CSS

let dragging = false
let didDrag = false
let startX = 0
let startY = 0

function onPointerDown(event) {
  dragging = true
  didDrag = false
  startX = event.clientX
  startY = event.clientY
}

function onPointerMove(event) {
  if (!dragging) {
    return
  }

  const deltaX = event.clientX - startX
  const deltaY = event.clientY - startY

  const cellDeltaX = Math.trunc(deltaX / CELL_SIZE)
  const cellDeltaY = Math.trunc(deltaY / CELL_SIZE)

  if (cellDeltaX !== 0 || cellDeltaY !== 0) {
    didDrag = true
    emit('pan', -cellDeltaX, -cellDeltaY)
    startX += cellDeltaX * CELL_SIZE
    startY += cellDeltaY * CELL_SIZE
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
    :style="{ '--columns': width }"
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
  --cell-size: 28px;
  display: grid;
  grid-template-columns: repeat(var(--columns), var(--cell-size));
  touch-action: none;
  border: 2px solid #333;
  width: fit-content;
}
</style>