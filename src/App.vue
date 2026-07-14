<script setup>
import { reactive } from 'vue'
import { computed } from 'vue'
import MineGrid from './components/MineGrid.vue'
import {
  createGame,
  revealCell,
  toggleFlag
} from "./game/game"

const game = reactive(createGame(10, 10, 25))
const cellList = computed(() =>
[...game.cells.values()]
)
const flagsPlaced = computed(() =>
cellList.value.filter(cell => cell.flagged).length
)

function onCellClick(cell) {
  revealCell(game, cell)
}

function onCellFlag(cell) {
  toggleFlag(game, cell)
}
</script>

<template>
  <h1>Hibol Minesweeper</h1>
  
  <p>
    State : {{ game.status }}
  </p>
  <p>
    Flags : {{ flagsPlaced }} / {{ game.mineCount }}
  </p>
  
  <MineGrid 
  :cells="cellList"
  :width="game.width"
  @click="onCellClick"
  @flag="onCellFlag"
  />
</template>

<style scoped>

</style>