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

// En infini on affiche une colonne/ligne de plus que ce qui tient à l'écran :
// cette bordure sert de réserve pour le morceau de case coupé par le décalage
// fractionnaire (offsetX/offsetY), donc il y a toujours une case déjà prête
// à glisser dans le cadre au lieu d'apparaître d'un coup.
const renderWidth = computed(() =>
  game.value.mode === "infinite" ? viewportWidth.value + 1 : game.value.width
)

const renderHeight = computed(() =>
  game.value.mode === "infinite" ? viewportHeight.value + 1 : game.value.height
)

const cellList = computed(() => {
  if (game.value.mode === "infinite") {
    return getVisibleCells(
      game.value,
      Math.floor(originX.value),
      Math.floor(originY.value),
      renderWidth.value,
      renderHeight.value
    )
  }
  return getVisibleCells(game.value, 0, 0, game.value.width, game.value.height)
})

// Partie de cellule qui dépasse à gauche/en haut à cause de l'origine
// fractionnaire — c'est ce décalage en pixels qui remplace le "saut" par
// un positionnement continu de la grille.
const offsetX = computed(() => (originX.value - Math.floor(originX.value)) * CELL_SIZE)
const offsetY = computed(() => (originY.value - Math.floor(originY.value)) * CELL_SIZE)
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

function pan(dxPx, dyPx) {
  if (game.value.mode !== "infinite") {
    return
  }

  originX.value += dxPx / CELL_SIZE
  originY.value += dyPx / CELL_SIZE
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

  <main class="game-area" :class="{ infinite: game.mode === 'infinite' }" ref="gameAreaRef">
    <MineGrid
      :cells="cellList"
      :width="renderWidth"
      :seamless="game.mode === 'infinite'"
      :offset-x="offsetX"
      :offset-y="offsetY"
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
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.game-area.infinite {
  align-items: flex-start;
  justify-content: flex-start;
}

.game-area.infinite::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(
      to right,
      rgba(0, 0, 0, 0.18),
      transparent calc(var(--cell-size) * 2),
      transparent calc(100% - var(--cell-size) * 2),
      rgba(0, 0, 0, 0.18)
    ),
    linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.18),
      transparent calc(var(--cell-size) * 2),
      transparent calc(100% - var(--cell-size) * 2),
      rgba(0, 0, 0, 0.18)
    );
}
</style>