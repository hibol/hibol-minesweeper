<script setup>
import MineCell from "./MineCell.vue"

const props = defineProps({
  cells: Array,
  width: Number,
  seamless: Boolean,
  simplified: Boolean,
  offsetX: {
    type: Number,
    default: 0,
  },
  offsetY: {
    type: Number,
    default: 0,
  },
  // Instance de usePointerGestures créée par App.vue, partagée avec MapCanvas.
  gestures: Object,
})

const emit = defineEmits(["click", "flag"])

function onCellPressStart(cell) {
  props.gestures.startLongPress(() => emit("flag", cell))
}

function onCellClick(cell) {
  if (props.gestures.tapAllowed()) {
    emit("click", cell)
  }
}

function onCellFlag(cell) {
  props.gestures.triggerSecondaryAction(() => emit("flag", cell))
}
</script>

<template>
  <div
    class="grid"
    :class="{ seamless }"
    :style="{
      '--columns': width,
      transform: `translate(${-offsetX}px, ${-offsetY}px)`,
    }"
    @pointerdown="gestures.onPointerDown"
    @pointermove="gestures.onPointerMove"
    @pointerup="gestures.onPointerUp"
    @pointerleave="gestures.onPointerUp"
    @pointercancel="gestures.onPointerUp"
    @wheel.prevent="gestures.onWheel"
  >
    <MineCell
      v-for="cell in cells"
      :key="`${cell.x}-${cell.y}`"
      :cell="cell"
      :seamless="seamless"
      :simplified="simplified"
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
