<script setup>
import { ref, computed, watch } from 'vue'
import MineGrid from './components/MineGrid.vue'
import BurgerMenu from './components/BurgerMenu.vue'
import { useViewportCamera } from './composables/useViewportCamera'
import { MINE_PIXELS, FLAG_PIXELS } from './icons'
import { recordRun } from './runHistory'
import {
  createGame,
  revealCell,
  toggleFlag,
  getVisibleCells,
  createInfiniteGame,
  getDarkness,
  giveUp,
  getDangerLevel,
  DARKNESS_MINE_THRESHOLD,
  MAX_OPENING_REVEAL
} from "./game/game"

const CELL_SIZE = 28 // doit correspondre à --cell-size dans MineGrid.vue
const INFINITE_UNLOCKED_KEY = "hibol-minesweeper:infinite-unlocked"

const game = ref(createGame(10, 10, 25))
const infiniteUnlocked = ref(localStorage.getItem(INFINITE_UNLOCKED_KEY) === "true")

const WIN_BANNER_DURATION_MS = 3000
const showWinBanner = ref(false)
const justUnlockedInfinite = ref(false)
let winBannerTimeout = null

function dismissWinBanner() {
  clearTimeout(winBannerTimeout)
  showWinBanner.value = false
  justUnlockedInfinite.value = false
}

const showGiveUpBanner = ref(false)
const giveUpRank = ref(null)

function dismissGiveUpBanner() {
  showGiveUpBanner.value = false
}

watch(
  () => game.value.status,
  (status) => {
    if (game.value.mode === "classic" && status === "won") {
      const firstWin = !infiniteUnlocked.value

      if (firstWin) {
        infiniteUnlocked.value = true
        localStorage.setItem(INFINITE_UNLOCKED_KEY, "true")
      }

      justUnlockedInfinite.value = firstWin
      showWinBanner.value = true
      clearTimeout(winBannerTimeout)
      winBannerTimeout = setTimeout(dismissWinBanner, WIN_BANNER_DURATION_MS)
    }

    if (game.value.mode === "infinite" && status === "lost") {
      const { rank } = recordRun({
        revealedCount: game.value.revealedCount,
        distance: Math.round(game.value.maxDistance),
        minesTriggeredCount: game.value.minesTriggeredCount,
        seed: game.value.seed,
        timestamp: Date.now()
      })

      giveUpRank.value = rank
      showGiveUpBanner.value = true
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
  dismissWinBanner()
  dismissGiveUpBanner()
}

function startInfiniteGame() {
  game.value = createInfiniteGame(Date.now(), 0.15)
  centerOn(0, 0)
  dismissWinBanner()
  dismissGiveUpBanner()
}

// Une run infinie encore en cours (pas déjà perdue/give up) et qui a dépassé
// l'ouverture automatique de départ (MAX_OPENING_REVEAL) représente une vraie
// progression du joueur, pas juste le patch offert au démarrage — l'écraser
// sans prévenir serait une perte silencieuse, jamais enregistrée dans le top
// puisque seul un "give up" y ajoute une run.
const pendingStart = ref(null) // 'classic' | 'infinite' | null

function hasMeaningfulInfiniteRun() {
  return (
    game.value.mode === "infinite" &&
    game.value.status === "playing" &&
    game.value.revealedCount > MAX_OPENING_REVEAL
  )
}

function requestStartClassicGame() {
  if (hasMeaningfulInfiniteRun()) {
    pendingStart.value = "classic"
    return
  }
  startClassicGame()
}

function requestStartInfiniteGame() {
  if (hasMeaningfulInfiniteRun()) {
    pendingStart.value = "infinite"
    return
  }
  startInfiniteGame()
}

function confirmPendingStart() {
  if (pendingStart.value === "classic") {
    startClassicGame()
  } else if (pendingStart.value === "infinite") {
    startInfiniteGame()
  }
  pendingStart.value = null
}

function cancelPendingStart() {
  pendingStart.value = null
}

function onGridPan(dxPx, dyPx) {
  if (game.value.mode === "infinite") {
    pan(dxPx, dyPx)
  }
}
</script>

<template>
  <header class="app-header">
    <div class="header-menu-slot">
      <BurgerMenu />
    </div>
    <h1>Hibol Minesweeper</h1>
    <div class="actions">
      <button class="pixel-btn" @click="requestStartClassicGame">Classic Game</button>
      <button
        class="pixel-btn"
        :class="{ pulse: justUnlockedInfinite }"
        @click="requestStartInfiniteGame"
        :disabled="!infiniteUnlocked"
      >Infinite Game</button>
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
    <button v-if="darkness >= 1" class="give-up pixel-btn" @click="onGiveUp">Give up</button>

    <Transition name="win-banner">
      <div v-if="showWinBanner" class="win-banner" @click="dismissWinBanner">
        <div class="win-banner-title">YOU WIN</div>
        <div v-if="justUnlockedInfinite" class="win-banner-sub">INFINITE MODE UNLOCKED</div>
      </div>
    </Transition>

    <Transition name="win-banner">
      <div v-if="showGiveUpBanner" class="win-banner" @click="dismissGiveUpBanner">
        <div class="win-banner-title">GAME OVER</div>
        <div class="win-banner-sub">CELLS {{ game.revealedCount }}</div>
        <div class="win-banner-sub">DISTANCE {{ Math.round(game.maxDistance) }}</div>
        <div v-if="giveUpRank" class="win-banner-sub">TOP {{ giveUpRank }} RUN!</div>
      </div>
    </Transition>
  </main>

  <div v-if="pendingStart" class="confirm-overlay" @click.self="cancelPendingStart">
    <div class="confirm-box">
      <div class="confirm-title">DISCARD CURRENT RUN?</div>
      <div class="confirm-sub">{{ game.revealedCount }} cells explored will be lost</div>
      <div class="confirm-actions">
        <button class="pixel-btn" @click="cancelPendingStart">Cancel</button>
        <button class="pixel-btn" @click="confirmPendingStart">Discard</button>
      </div>
    </div>
  </div>

  <footer v-if="game.mode === 'infinite'" class="app-footer">
    <div class="danger-row">
      <span class="danger-label">DANGER</span>
      <div class="danger-bar">
        <div class="danger-bar-fill" :style="{ width: `${dangerLevel * 100}%` }"></div>
      </div>
    </div>
    <div class="stats-row">
      <span class="stat">CELLS {{ game.revealedCount }}</span>
      <span class="stat">
        <svg viewBox="0 0 9 9" class="stat-icon" shape-rendering="crispEdges">
          <rect v-for="(p, i) in FLAG_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
        </svg>
        FLAGS {{ game.flaggedCount }}
      </span>
      <span class="stat">
        <svg viewBox="0 0 9 9" class="stat-icon" shape-rendering="crispEdges">
          <rect v-for="(p, i) in MINE_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
        </svg>
        MINES {{ game.minesTriggeredCount }}
      </span>
    </div>
  </footer>

  <footer v-else-if="game.mode === 'classic'" class="app-footer">
    <div class="stats-row">
      <span class="stat">
        <svg viewBox="0 0 9 9" class="stat-icon" shape-rendering="crispEdges">
          <rect v-for="(p, i) in FLAG_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
        </svg>
        FLAGS: {{ game.flaggedCount }}/{{ game.mineCount }}
      </span>
    </div>
  </footer>
</template>

<style scoped>
.app-header {
  position: relative;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  border-bottom: 2px solid #333;
  flex-shrink: 0;
  font-family: 'VT323', monospace;
}

.header-menu-slot {
  position: absolute;
  top: 10px;
  right: 12px;
}

.app-header h1 {
  margin: 0;
  font-size: 26px;
  font-weight: normal;
  color: #222;
  text-transform: uppercase;
}

.app-footer {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  border-top: 2px solid #333;
  flex-shrink: 0;
  font-family: 'VT323', monospace;
}

.danger-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 340px;
}

.danger-label {
  font-size: 15px;
  color: #333;
}

.danger-bar {
  flex: 1;
  height: 12px;
  background: #ddd;
  border: 1px solid #999;
}

.danger-bar-fill {
  height: 100%;
  background: #c0392b;
}

.stats-row {
  display: flex;
  gap: 22px;
  font-size: 16px;
  color: #333;
  letter-spacing: 1px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 5px;
}

.stat-icon {
  width: 14px;
  height: 14px;
}

.actions {
  display: flex;
  gap: 6px;
}

.pixel-btn {
  font-family: 'VT323', monospace;
  font-size: 15px;
  letter-spacing: 1px;
  background: #eee;
  border: 2px solid #333;
  box-shadow: 2px 2px 0 #999;
  padding: 4px 10px;
  color: #222;
  cursor: pointer;
}

.pixel-btn:disabled {
  opacity: 0.5;
  cursor: default;
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
  /* Canaux RGB du voile, factorisés ici pour ne les changer qu'à un seul
     endroit (réutilisés ci-dessous via rgb(var(--fog-color) / alpha)). */
  --fog-color: 231 231 231;
  /* Paliers nets plutôt qu'un fondu continu : chaque bande est une couleur
     plate (pas d'interpolation à l'intérieur), pour un voile "pixelisé" par
     anneaux façon brouillard de guerre 8-bit, au lieu d'un flou lisse. */
  background: radial-gradient(
    ellipse var(--clear-radius-x) var(--clear-radius-y) at center,
    transparent 100%,
    rgb(var(--fog-color) / 0.25) 100%, rgb(var(--fog-color) / 0.25) 108%,
    rgb(var(--fog-color) / 0.5) 108%, rgb(var(--fog-color) / 0.5) 116%,
    rgb(var(--fog-color) / 0.75) 116%, rgb(var(--fog-color) / 0.75) 123%,
    rgb(var(--fog-color) / 1) 123%
  );
}

.give-up {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1;
}

.win-banner {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translate(-50%, 0);
  z-index: 2;
  background: #eee;
  border: 2px solid #333;
  box-shadow: 4px 4px 0 #999;
  padding: 10px 20px;
  text-align: center;
  cursor: pointer;
}

.win-banner-title {
  font-family: 'Press Start 2P', monospace;
  font-size: 18px;
  color: #222;
}

.win-banner-sub {
  margin-top: 8px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: #333;
  letter-spacing: 1px;
}

/* Transition en escaliers (steps) plutôt qu'un easing lisse : un mouvement
   saccadé colle davantage au thème 8-bit qu'un fondu/slide continu. */
.win-banner-enter-active,
.win-banner-leave-active {
  transition: transform 0.4s steps(6, end), opacity 0.4s steps(6, end);
}

.win-banner-enter-from,
.win-banner-leave-to {
  transform: translate(-50%, -150%);
  opacity: 0;
}

/* Pulse du bouton "Infinite Game" lors du tout premier déblocage : clignote
   un nombre fini de fois (steps à 2 crans, pas de glow progressif) puis
   s'arrête de lui-même sans qu'il soit besoin de retirer la classe. */
@keyframes pixel-btn-pulse {
  0%, 100% { box-shadow: 2px 2px 0 #999; }
  50% { box-shadow: 2px 2px 0 #999, 0 0 0 3px #c62828; }
}

.pixel-btn.pulse {
  animation: pixel-btn-pulse 0.5s steps(2, jump-none) 6;
}

.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 10;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.confirm-box {
  background: #eee;
  border: 2px solid #333;
  box-shadow: 4px 4px 0 #999;
  padding: 16px 20px;
  text-align: center;
  font-family: 'VT323', monospace;
}

.confirm-title {
  font-family: 'Press Start 2P', monospace;
  font-size: 15px;
  color: #222;
}

.confirm-sub {
  margin-top: 8px;
  font-size: 15px;
  color: #333;
}

.confirm-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 14px;
}
</style>
