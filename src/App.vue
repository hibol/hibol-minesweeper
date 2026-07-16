<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import MineGrid from './components/MineGrid.vue'
import {
  createGame,
  revealCell,
  toggleFlag,
  getVisibleCells,
  createInfiniteGame
} from "./game/game"

const CELL_SIZE = 28 // doit correspondre à --cell-size dans MineGrid.vue

const game = ref(createGame(10, 10, 25))
const originX = ref(0)
const originY = ref(0)

const gameAreaRef = ref(null)
const containerWidth = ref(0)
const containerHeight = ref(0)
let resizeObserver

onMounted(() => {
  resizeObserver = new ResizeObserver((entries) => {
    containerWidth.value = entries[0].contentRect.width
    containerHeight.value = entries[0].contentRect.height
  })
  resizeObserver.observe(gameAreaRef.value)
})

onUnmounted(() => {
  resizeObserver.disconnect()
})

const viewportWidth = computed(() =>
  game.value.mode === "infinite"
    ? Math.max(1, Math.floor(containerWidth.value / CELL_SIZE))
    : game.value.width
)

const viewportHeight = computed(() =>
  game.value.mode === "infinite"
    ? Math.max(1, Math.floor(containerHeight.value / CELL_SIZE))
    : game.value.height
)

const cellList = computed(() => {
  if (game.value.mode === "infinite") {
    return getVisibleCells(game.value, originX.value, originY.value, viewportWidth.value, viewportHeight.value)
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
  originX.value = -Math.floor(viewportWidth.value / 2)
  originY.value = -Math.floor(viewportHeight.value / 2)
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
  <header class="app-header">
    <h1>Hibol Minesweeper</h1>
    <p>State : {{ game.status }}</p>
    <p v-if="game.mode === 'classic'">Flags : {{ flagsPlaced }} / {{ game.mineCount }}</p>
    <div class="actions">
      <button @click="startClassicGame">Classic Game</button>
      <button @click="startInfiniteGame">Infinite Game</button>
    </div>
  </header>

  <main class="game-area" ref="gameAreaRef">
    <MineGrid
      :cells="cellList"
      :width="viewportWidth"
      :seamless="game.mode === 'infinite'"
      @click="onCellClick"
      @flag="onCellFlag"
      @pan="pan"
    />
  </main>
</template>

<style scoped>
.app-header {
  padding: 8px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex-shrink: 0;
}

.app-header h1 {
  margin: 0;
  font-size: 1.25rem;
}

.app-header p {
  margin: 0;
}

.actions {
  display: flex;
  gap: 8px;
}

.game-area {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
</style>