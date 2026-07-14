<script setup>
import MineCell from './MineCell.vue'

defineProps({
  cells: Array,
  width: Number
})
</script>

<template>
  <div
    class="grid"
    :style="{ '--columns': width }"
  >
    <MineCell
      v-for="cell in cells"
      :key="`${cell.x}-${cell.y}`"
      :cell="cell"
      @click="$emit('click', cell)"
      @flag="$emit('flag', cell)"
    />
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(var(--columns), 40px);
}
.grid div {
    width: 40px;
    height: 40px;
    border: 1px solid black;
    display: flex;
    justify-content: center;
    align-items: center;
  }
</style>