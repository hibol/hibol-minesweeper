<script setup>
import { ref, computed, watch } from 'vue'
import MineGrid from './components/MineGrid.vue'
import { useViewportCamera } from './composables/useViewportCamera'
import {
  createGame,
  revealCell,
  toggleFlag,
  getVisibleCells,
  createInfiniteGame,
  getDarkness,
  giveUp,
  getDangerLevel,
  DARKNESS_MINE_THRESHOLD
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

// Exposant < 1 (concave) plutôt que > 1 : monte vite dès les premières
// mines, pour que l'effet soit déjà visible tôt. Le resserrement final vers
// ~3 cases ne dépend pas de la forme de cette courbe mais du rayon cible fixe
// dans clearRadiusOn — donc pas de perte sur la sévérité au plafond.
const darkness = computed(() => getDarkness(game.value) ** 0.4)

// Une ellipse de rayons (largeur/2, hauteur/2) touche pile les bords du
// viewport mais laisse ses coins dehors (plus loin du centre qu'un bord) :
// il faut un facteur >= racine de 2 pour que les coins rentrent dedans. 1.5
// donne une marge confortable pour qu'il n'y ait vraiment rien de visible à
// darkness 0, quelle que soit la forme du viewport.
const CORNER_COVERAGE = 1.5

// Progresse de 0 à 1 en fonction du nombre de mines seul (pas de darkness,
// donc pas de l'exposant concave ci-dessus) : atteint 1 à la moitié du seuil
// puis y reste — c'est ce qui pilote le passage ellipse -> cercle, séparément
// de la taille du voile.
const roundness = computed(() =>
  Math.min(1, game.value.minesTriggeredCount / (DARKNESS_MINE_THRESHOLD / 2))
)

// Rayons (en px, un par axe pour suivre le ratio du viewport plutôt qu'un
// cercle) où le voile redevient transparent. Partent d'une ellipse qui
// couvre tout le viewport, coins compris (donc hors champ à darkness 0), et
// se resserrent vers 1.5 case (~3 cases de diamètre) au plafond — les coins,
// plus loin du centre, se couvrent naturellement avant les bords.
function clearRadiusOn(dimension) {
  const ellipticalStart = (dimension.value / 2 + 1) * CELL_SIZE * CORNER_COVERAGE
  const circularStart = (Math.max(viewportWidth.value, viewportHeight.value) / 2 + 1) * CELL_SIZE * CORNER_COVERAGE
  const startRadius = ellipticalStart * (1 - roundness.value) + circularStart * roundness.value
  const endRadius = CELL_SIZE * 1.5
  return startRadius * (1 - darkness.value) + endRadius * darkness.value
}

const clearRadiusX = computed(() => clearRadiusOn(viewportWidth))
const clearRadiusY = computed(() => clearRadiusOn(viewportHeight))

const dangerLevel = computed(() =>
  getDangerLevel(
    game.value,
    originX.value + viewportWidth.value / 2,
    originY.value + viewportHeight.value / 2
  )
)

function onGiveUp() {
  giveUp(game.value)
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
    <p v-if="game.mode === 'classic'">State: {{ game.status }}</p>
    <p v-if="game.mode === 'classic'">Flags: {{ game.flaggedCount }} / {{ game.mineCount }}</p>
    <div class="actions">
      <button @click="startClassicGame">Classic Game</button>
      <button @click="startInfiniteGame" :disabled="!infiniteUnlocked">Infinite Game</button>
    </div>
  </header>

  <main
    class="game-area"
    :class="{ infinite: game.mode === 'infinite' }"
    :style="{
      '--clear-radius-x': `${clearRadiusX}px`,
      '--clear-radius-y': `${clearRadiusY}px`
    }"
    ref="containerRef"
  >
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
    <button v-if="darkness >= 1" class="give-up" @click="onGiveUp">Give up</button>
  </main>

  <footer v-if="game.mode === 'infinite'" class="app-footer">
    <span>Danger:</span>
    <div class="danger-bar">
      <div class="danger-bar-fill" :style="{ width: `${dangerLevel * 100}%` }"></div>
    </div>
    <span>Cells revealed: {{ game.revealedCount }} Flags placed: {{ game.flaggedCount }} Mines triggered: {{ game.minesTriggeredCount }}</span>
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-shrink: 0;
}

.danger-bar {
  width: 120px;
  height: 6px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 3px;
  overflow: hidden;
}

.danger-bar-fill {
  height: 100%;
  background: #c0392b;
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

/*
 * --clear-radius-x/y (calculés en JS, cf. clearRadiusX/Y) sont les rayons
 * horizontal et vertical, depuis le centre, où le voile redevient
 * transparent — un par axe pour suivre le ratio du viewport (une ellipse
 * plutôt qu'un cercle) au lieu de favoriser les coins. Ils partent de la
 * moitié de chaque dimension réelle du viewport (donc hors champ à
 * darkness 0) et se resserrent vers 1.5 case (~3 cases de diamètre) au
 * plafond. Calculés en JS plutôt qu'en CSS pur pour qu'ils soient toujours
 * relatifs à la vraie taille du conteneur.
 *
 * Typés via @property pour que le navigateur sache les interpoler : ça
 * permet une vraie transition douce (voir `transition` ci-dessous) au lieu
 * d'un saut brutal à chaque mine déclenchée.
 *
 * L'opacité, elle, ne suit PAS la progression : elle est fixe, pour que la
 * zone déjà touchée soit franchement visible dès qu'elle apparaît. C'est
 * les rayons (donc la surface couverte) qui portent toute la difficulté.
 */
@property --clear-radius-x {
  syntax: '<length>';
  inherits: true;
  initial-value: 0px;
}

@property --clear-radius-y {
  syntax: '<length>';
  inherits: true;
  initial-value: 0px;
}

.game-area.infinite {
  align-items: flex-start;
  justify-content: flex-start;
  transition: --clear-radius-x 0.4s ease, --clear-radius-y 0.4s ease;
}

.game-area.infinite::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    ellipse var(--clear-radius-x) var(--clear-radius-y) at center,
    transparent 100%,
    rgb(241, 241, 241) 115%
  );
}

.give-up {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1;
}
</style>
