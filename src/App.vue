<script setup>
import { ref, computed } from 'vue'
import MineGrid from './components/MineGrid.vue'
import {
  createGame,
  revealCell,
  toggleFlag,
  getVisibleCells,
  createInfiniteGame
} from "./game/game"

const VIEWPORT_WIDTH = 25
const VIEWPORT_HEIGHT = 18

const game = ref(createGame(10, 10, 25))
const originX = ref(0)
const originY = ref(0)

const cellList = computed(() => {
  if (game.value.mode === "infinite") {
    return getVisibleCells(game.value, originX.value, originY.value, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
  }
  return getVisibleCells(game.value, 0, 0, game.value.width, game.value.height)
})
const flagsPlaced = computed(() =>
cellList.value.filter(cell => cell.flagged).length
)

function onCellClick(cell) {
  revealCell(game.value, cell)
}

function onCellFlag(cell) {
  toggleFlag(game.value, cell)
}

function startClassicGame() {
  game.value = createGame(10, 10, 25)
  originX.value = 0
  originY.value = 0
}

function startInfiniteGame() {
  game.value = createInfiniteGame(Date.now(), 0.15)
  originX.value = 0
  originY.value = 0
}

function pan(dx, dy) {
  if (game.value.mode !== "infinite") {
    return
  }

  originX.value += dx
  originY.value += dy
}
</script>

<template>
  <h1>Hibol Minesweeper</h1>
  
  <p>State : {{ game.status }}</p>
  <p v-if="game.mode === 'classic'">Flags : {{ flagsPlaced }} / {{ game.mineCount }}</p>

  <button @click="startClassicGame">Classic Game</button>
  <button @click="startInfiniteGame">Infinite Game</button>
  
  <MineGrid 
  :cells="cellList"
  :width="game.mode === 'infinite' ? VIEWPORT_WIDTH : game.width"
  @click="onCellClick"
  @flag="onCellFlag"
  @pan="pan"
  />
</template>

<style scoped>

</style>