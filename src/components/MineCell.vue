<script setup>
defineProps({
  cell: Object,
  seamless: Boolean
})
</script>

<template>
  <div class="cell"
    @click="$emit('click')"
     :class="{ revealed: cell.revealed, seamless }"
    @contextmenu.prevent="$emit('flag')"
  >
    <span v-if="cell.flagged">
        <span v-if="cell.wrong">❌</span>
        <span v-else>🚩</span>
    </span>
    <span v-else-if="cell.revealed">
      <span v-if="cell.isMine">💣</span>
      <span v-else-if="cell.neighborMines > 0" :class="'n' + cell.neighborMines">{{ cell.neighborMines }}</span>
    </span>
  </div>
</template>

<style scoped>
.cell {
  width: var(--cell-size);
  height: var(--cell-size);
  font-size: 0.75rem;
  font-weight: bold;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #d5d5d5;
  border: 1px solid #999;
  user-select: none;
  cursor: pointer;
}
.cell.revealed {
  background: #eee;
  border-color: #ccc;
  cursor: default;
}

.cell.seamless:not(.revealed) {
  border: none;
  background: transparent;
}

.wrong {
  color: #d32f2f;
}
.n1 { color: #1565c0; }
.n2 { color: #2e7d32; }
.n3 { color: #c62828; }
.n4 { color: #6a1b9a; }
.n5 { color: #8d4004; }
.n6 { color: #00838f; }
.n7 { color: #000; }
.n8 { color: #616161; }
</style>