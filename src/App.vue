<script setup>
import { ref, computed, watch } from 'vue'
import MineGrid from './components/MineGrid.vue'
import BurgerMenu from './components/BurgerMenu.vue'
import WinBanner from './components/WinBanner.vue'
import LockedHint from './components/LockedHint.vue'
import GameOverBanner from './components/GameOverBanner.vue'
import ConfirmDiscardDialog from './components/ConfirmDiscardDialog.vue'
import { useViewportCamera } from './composables/useViewportCamera'
import { useFogOfWar } from './composables/useFogOfWar'
import { MINE_PIXELS, FLAG_PIXELS } from './icons'
import { recordRun } from './runHistory'
import { tapAction } from './settings'
import {
  createGame,
  revealCell,
  toggleFlag,
  getVisibleCells,
  createInfiniteGame,
  giveUp,
  getDangerLevel,
  MAX_OPENING_REVEAL
} from "./game/game"

const CELL_SIZE = 28 // doit correspondre à --cell-size dans style.css
const INFINITE_UNLOCKED_KEY = "hibol-minesweeper:infinite-unlocked"

// En dessous de cette taille de case (px), une case en mode infini n'affiche
// plus son icône/chiffre — juste un aplat de couleur (cf. MineCell.vue) : à
// ce niveau de dézoom le détail serait illisible de toute façon, autant lire
// la silhouette de la zone explorée plutôt qu'un bruit de pixels.
const SIMPLIFIED_RENDER_THRESHOLD = 16

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

const LOCKED_HINT_DURATION_MS = 2000
const showLockedHint = ref(false)
let lockedHintTimeout = null

// Le bouton reste cliquable même "verrouillé" (cf. classe .locked plutôt que
// l'attribut disabled dans le template) : un <button disabled> ne déclenche
// aucun événement click, impossible d'intercepter le clic pour afficher ce
// message sinon.
function onInfiniteButtonClick() {
  if (!infiniteUnlocked.value) {
    showLockedHint.value = true
    clearTimeout(lockedHintTimeout)
    lockedHintTimeout = setTimeout(() => {
      showLockedHint.value = false
    }, LOCKED_HINT_DURATION_MS)
    return
  }

  requestStartInfiniteGame()
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
  cellSize,
  cellsAcross,
  cellsDown,
  offsetX,
  offsetY,
  pan,
  centerOn,
  zoomBy,
  resetZoom
} = useViewportCamera(CELL_SIZE)

const simplified = computed(() =>
  game.value.mode === "infinite" && cellSize.value < SIMPLIFIED_RENDER_THRESHOLD
)

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

// originX/Y bougent en continu (valeurs fractionnaires) pendant un drag,
// mais cellList n'a besoin que de leur partie entière : passer par ces
// computed intermédiaires plutôt que d'appeler Math.floor directement dans
// cellList évite de reconstruire la liste des cases visibles à chaque pixel
// glissé. Un computed Vue ne notifie ses dépendants que si la valeur qu'il
// renvoie a réellement changé — donc flooredOriginX ne se propage à cellList
// que quand on franchit une case entière (~28px), pas à chaque pixel.
const flooredOriginX = computed(() => Math.floor(originX.value))
const flooredOriginY = computed(() => Math.floor(originY.value))

const cellList = computed(() => {
  if (game.value.mode === "infinite") {
    return getVisibleCells(
      game.value,
      flooredOriginX.value,
      flooredOriginY.value,
      renderWidth.value,
      renderHeight.value
    )
  }
  return getVisibleCells(game.value, 0, 0, game.value.width, game.value.height)
})

// Le tap/clic principal fait l'action choisie dans les Settings (reveal par
// défaut) ; le clic droit / contextmenu (voir MineCell.vue) fait toujours
// l'autre action, quel que soit le réglage — utile pour flagger sur mobile,
// où il n'y a pas de clic droit : on bascule temporairement le réglage.
// Sur une case déjà révélée, le réglage ne s'applique pas : flaguer une case
// ouverte n'a aucun sens (toggleFlag no-op dessus de toute façon), donc le
// clic principal doit toujours pouvoir déclencher le chord (revealCell gère
// lui-même la distinction premier reveal / chord).
function onCellClick(cell) {
  if (cell.revealed) {
    revealCell(game.value, cell)
    return
  }

  if (tapAction.value === "flag") {
    toggleFlag(game.value, cell)
  } else {
    revealCell(game.value, cell)
  }
}

function onCellFlag(cell) {
  if (tapAction.value === "flag") {
    revealCell(game.value, cell)
  } else {
    toggleFlag(game.value, cell)
  }
}

const { darkness, clearRadiusX, clearRadiusY } = useFogOfWar(game, viewportWidth, viewportHeight, cellSize)

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
  // Le classic garde son zoom d'une partie classic à l'autre (cf.
  // startInfiniteGame), mais un zoom hérité d'une exploration infinie n'a
  // aucun sens sur un plateau classic tout neuf : on ne reset qu'à la
  // transition depuis l'infini, pas d'un classic à l'autre.
  if (game.value.mode === "infinite") {
    resetZoom()
  }
  game.value = createGame(10, 10, 25)
  dismissWinBanner()
  dismissGiveUpBanner()
}

function startInfiniteGame(seed = Date.now()) {
  game.value = createInfiniteGame(seed, 0.15)
  centerOn(0, 0)
  // Contrairement au classic (qui garde le zoom d'une partie à l'autre, un
  // réglage d'affichage plus qu'un état de run), chaque run infinie repart
  // d'une vue neutre : le zoom d'une exploration passée n'a pas de raison de
  // s'appliquer à un monde tout neuf.
  resetZoom()
  dismissWinBanner()
  dismissGiveUpBanner()
}

// Une run infinie encore en cours (pas déjà perdue/give up) et qui a dépassé
// l'ouverture automatique de départ (MAX_OPENING_REVEAL) représente une vraie
// progression du joueur, pas juste le patch offert au démarrage — l'écraser
// sans prévenir serait une perte silencieuse, jamais enregistrée dans le top
// puisque seul un "give up" y ajoute une run.
const pendingStart = ref(null) // 'classic' | 'infinite' | null
const pendingSeed = ref(null) // seed explicite (menu burger) pour la relance infinie en attente

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

function requestStartInfiniteGame(seed) {
  if (hasMeaningfulInfiniteRun()) {
    pendingStart.value = "infinite"
    pendingSeed.value = seed ?? null
    return
  }
  startInfiniteGame(seed)
}

function confirmPendingStart() {
  if (pendingStart.value === "classic") {
    startClassicGame()
  } else if (pendingStart.value === "infinite") {
    startInfiniteGame(pendingSeed.value ?? undefined)
  }
  pendingStart.value = null
  pendingSeed.value = null
}

function cancelPendingStart() {
  pendingStart.value = null
  pendingSeed.value = null
}

function onGridPan(dxPx, dyPx) {
  if (game.value.mode === "infinite") {
    pan(dxPx, dyPx)
  }
}

function onGridZoom(factor, clientX, clientY) {
  zoomBy(factor, clientX, clientY)
}
</script>

<template>
  <header class="app-header">
    <div class="header-menu-slot">
      <BurgerMenu :infinite-unlocked="infiniteUnlocked" @start-infinite-with-seed="requestStartInfiniteGame" />
    </div>
    <h1>Hibol Minesweeper</h1>
    <div class="actions">
      <button class="pixel-btn" @click="requestStartClassicGame">Classic Game</button>
      <div class="infinite-btn-wrap">
        <button
          class="pixel-btn"
          :class="{ pulse: justUnlockedInfinite, locked: !infiniteUnlocked }"
          @click="onInfiniteButtonClick"
        >Infinite Game</button>
        <LockedHint :show="showLockedHint" />
      </div>
    </div>
  </header>

  <main
    class="game-area"
    :class="{ infinite: game.mode === 'infinite' }"
    :style="{
      '--cell-size': `${cellSize}px`,
      '--clear-radius-x': `${clearRadiusX}px`,
      '--clear-radius-y': `${clearRadiusY}px`
    }"
    ref="containerRef"
  >
    <MineGrid
      :cells="cellList"
      :width="renderWidth"
      :seamless="game.mode === 'infinite'"
      :simplified="simplified"
      :offset-x="offsetX"
      :offset-y="offsetY"
      @click="onCellClick"
      @flag="onCellFlag"
      @pan="onGridPan"
      @zoom="onGridZoom"
    />
    <button v-if="darkness >= 1" class="give-up pixel-btn" @click="onGiveUp">Give up</button>

    <WinBanner :show="showWinBanner" :just-unlocked="justUnlockedInfinite" @close="dismissWinBanner" />

    <GameOverBanner
      :show="showGiveUpBanner"
      :revealed-count="game.revealedCount"
      :max-distance="Math.round(game.maxDistance)"
      :rank="giveUpRank"
      @close="dismissGiveUpBanner"
    />
  </main>

  <ConfirmDiscardDialog
    :show="!!pendingStart"
    :revealed-count="game.revealedCount"
    @cancel="cancelPendingStart"
    @confirm="confirmPendingStart"
  />

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
  border-bottom: 2px solid var(--color-chrome-border);
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
  color: var(--color-text-strong);
  text-transform: uppercase;
}

.app-footer {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  border-top: 2px solid var(--color-chrome-border);
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
  color: var(--color-text);
}

.danger-bar {
  flex: 1;
  height: 12px;
  background: var(--color-danger-bar-bg);
  border: 1px solid var(--color-danger-bar-border);
}

.danger-bar-fill {
  height: 100%;
  background: var(--color-danger-fill);
}

.stats-row {
  display: flex;
  gap: 22px;
  font-size: 16px;
  color: var(--color-text);
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

.infinite-btn-wrap {
  position: relative;
}

/* Remplace l'attribut disabled natif (cf. onInfiniteButtonClick) : même
   rendu visuel que .pixel-btn:disabled dans style.css, mais en classe pour
   que le bouton reste cliquable. */
.pixel-btn.locked {
  opacity: 0.5;
  cursor: not-allowed;
}

.game-area {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--color-board-bg);
}

/*
 * --clear-radius-x/y (calculés en JS, cf. useFogOfWar) sont les rayons
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
  /* --fog-color (canaux RGB, pas un hex) vit maintenant dans style.css :root,
     avec une variante par thème — donc plus besoin de la fixer ici. */
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

/* Pulse du bouton "Infinite Game" lors du tout premier déblocage : clignote
   un nombre fini de fois (steps à 2 crans, pas de glow progressif) puis
   s'arrête de lui-même sans qu'il soit besoin de retirer la classe. */
@keyframes pixel-btn-pulse {
  0%, 100% { box-shadow: 2px 2px 0 var(--color-border-soft); }
  50% { box-shadow: 2px 2px 0 var(--color-border-soft), 0 0 0 3px #c62828; }
}

.pixel-btn.pulse {
  animation: pixel-btn-pulse 0.5s steps(2, jump-none) 6;
}
</style>
