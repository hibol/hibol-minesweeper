<script setup>
import { ref, computed, watch } from 'vue'
import MineGrid from './components/MineGrid.vue'
import { useViewportCamera } from './composables/useViewportCamera'
import {
  createGame,
  revealCell,
  toggleFlag,
  getVisibleCells,
  createInfiniteGame
} from "./game/game"

const CELL_SIZE = 28 // doit correspondre à --cell-size dans MineGrid.vue
const INFINITE_UNLOCKED_KEY = "hibol-minesweeper:infinite-unlocked"

const game = ref(createGame(10, 10, 25))
const infiniteUnlocked = ref(localStorage.getItem(INFINITE_UNLOCKED_KEY) === "true")

watch(
  () => game.value.status,
  (status) => {
    if (game.value.mode === "classic" && status === "won") {
      infiniteUnlocked.value = true
      localStorage.setItem(INFINITE_UNLOCKED_KEY, "true")
    }
  }
)

const {
  containerRef,
  originX,
  originY,
  cellsAcross,
  cellsDown,
  offsetX,
  offsetY,
  pan,
  centerOn
} = useViewportCamera(CELL_SIZE)

const viewportWidth = computed(() =>
  game.value.mode === "infinite" ? cellsAcross.value : game.value.width
)

const viewportHeight = computed(() =>
  game.value.mode === "infinite" ? cellsDown.value : game.value.height
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

function onCellClick(cell) {
  revealCell(game.value, cell)
}

function onCellFlag(cell) {
  toggleFlag(game.value, cell)
}

function startClassicGame() {
  game.value = createGame(10, 10, 25)
}

function startInfiniteGame() {
  game.value = createInfiniteGame(Date.now(), 0.15)
  centerOn(0, 0)
}

function onGridPan(dxPx, dyPx) {
  if (game.value.mode === "infinite") {
    pan(dxPx, dyPx)
  }
}
</script>

<template>
  <header class="app-header">
    <h1>Hibol Minesweeper</h1>
    <p>State: {{ game.status }}</p>
    <p v-if="game.mode === 'classic'">Flags: {{ game.flaggedCount }} / {{ game.mineCount }}</p>
    <div class="actions">
      <button @click="startClassicGame">Classic Game</button>
      <button @click="startInfiniteGame" :disabled="!infiniteUnlocked">Infinite Game</button>
    </div>
  </header>

  <main class="game-area" :class="{ infinite: game.mode === 'infinite' }" ref="containerRef">
    <MineGrid
      :cells="cellList"
      :width="renderWidth"
      :seamless="game.mode === 'infinite'"
      :offset-x="offsetX"
      :offset-y="offsetY"
      @click="onCellClick"
      @flag="onCellFlag"
      @pan="onGridPan"
    />
  </main>

  <footer v-if="game.mode === 'infinite'" class="app-footer">
    Cells revealed: {{ game.revealedCount }} Flags placed: {{ game.flaggedCount }} Mines triggered: {{ game.minesTriggeredCount }}
  </footer>
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

.app-footer {
  padding: 8px 20px;
  text-align: center;
  flex-shrink: 0;
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