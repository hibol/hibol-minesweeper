<script setup>
defineProps({
cell: Object
})
</script>

<template>
  <div class="cell" @click="$emit('click')" @contextmenu.prevent="$emit('flag')">
    <span v-if="cell.flagged">
        <span v-if="cell.wrong">❌</span>
        <span v-else>🚩</span>
    </span>
    <span v-else-if="cell.revealed">
      <span v-if="cell.isMine">💣</span>
      <span v-else>{{ cell.neighborMines }}</span>
    </span>
  </div>
</template>

<style scoped>
.cell {
  width: 40px;
  height: 40px;
  border: 1px solid black;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>