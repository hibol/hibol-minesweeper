<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import MineGrid from './components/MineGrid.vue'
import BurgerMenu from './components/BurgerMenu.vue'
import WinBanner from './components/WinBanner.vue'
import LockedHint from './components/LockedHint.vue'
import GameOverBanner from './components/GameOverBanner.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import IntroDialog from './components/IntroDialog.vue'
import SpecialCellsDialog from './components/SpecialCellsDialog.vue'
import AchievementBanner from './components/AchievementBanner.vue'
import ToastBanner from './components/ToastBanner.vue'
import PwaUpdatePrompt from './components/PwaUpdatePrompt.vue'
import { useViewportCamera } from './composables/useViewportCamera'
import { useFogOfWar } from './composables/useFogOfWar'
import { MINE_PIXELS, FLAG_PIXELS, HEART_PIXELS, ROBOT_PIXELS, HELP_PIXELS, ORIGIN_PIXELS, HOME_PIXELS } from './icons'
import { recordRun } from './runHistory'
import { tapAction, isTouchDevice, showHelpButton, showCoordinates } from './settings'
import { saveActiveGame, loadActiveGame, clearActiveGame } from './gameStorage'
import { markHeartFound, markRobotFound } from './discoveries'
import {
  unlockAchievement,
  recordClassicLoss,
  currentAchievementBanner,
  dismissAchievementBanner,
  holdAchievementBanners,
  resumeAchievementBanners
} from './achievements'
import { pushToast } from './toastQueue'
import {
  createGame,
  revealCell,
  toggleFlag,
  getVisibleCells,
  createInfiniteGame,
  restoreClassicGame,
  restoreInfiniteGame,
  giveUp,
  canGiveUp,
  getDangerLevel,
  isTooFarToReveal,
  MAX_OPENING_REVEAL,
  DEFAULT_DENSITY_SCALE
} from "./game/game"

const CELL_SIZE = 28 // doit correspondre à --cell-size dans style.css
const INFINITE_UNLOCKED_KEY = "hibol-minesweeper:infinite-unlocked"
const SEEN_INFINITE_INTRO_KEY = "hibol-minesweeper:seen-infinite-intro"
const SEEN_TAP_INTRO_KEY = "hibol-minesweeper:seen-tap-intro"

// Nées comme prototype du mode 3 (roadmap point 10) derrière le bouton DEV :
// une densityScale plus petite (rampe vers MAX_DENSITY plus vite avec
// l'éloignement, cf. game.js) ET un darknessMineThreshold bien plus bas
// (moins de mines déclenchées pour plafonner l'assombrissement), pour
// atteindre l'arc "calme -> dur -> espoir des cœurs" en quelques minutes au
// lieu d'heures. Adopté par le mode Infinite normal aussi (2026-07-28,
// retour direct du ressenti manette-en-main) — le bouton DEV démarre donc
// désormais une partie identique, laissé tel quel pour l'instant. Valeurs à
// retuner en jouant via ce même bouton — cf. tests
// scripts/autoplay.js --densityScale=X --darknessMineThreshold=Y.
const DEV_MODE3_DENSITY_SCALE = DEFAULT_DENSITY_SCALE / 4
const DEV_MODE3_DARKNESS_MINE_THRESHOLD = 8

// En dessous de cette taille de case (px), une case en mode infini n'affiche
// plus son icône/chiffre — juste un aplat de couleur (cf. MineCell.vue) : à
// ce niveau de dézoom le détail serait illisible de toute façon, autant lire
// la silhouette de la zone explorée plutôt qu'un bruit de pixels.
const SIMPLIFIED_RENDER_THRESHOLD = 16

const game = ref(createGame(10, 10, 20))
const infiniteUnlocked = ref(localStorage.getItem(INFINITE_UNLOCKED_KEY) === "true")

// Jalons "premier cœur"/"premier robot" (discoveries.js), pilote la case
// "Show '?' buttons" dans Settings — et achievements Hearty/Bouquet/Techy/
// Squad (roadmap point 8), même watcher plutôt qu'en dupliquer un par
// consommateur. Getter plutôt que game.value.xCount direct : suit une partie
// remplacée sans réabonner. immediate: true pour couvrir une partie
// restaurée déjà à count > 0 au montage.
watch(() => game.value.heartsCollectedCount, (count) => {
  if (count > 0) {
    markHeartFound()
    unlockAchievement('hearty')
  }
  if (count >= 10) {
    unlockAchievement('bouquet')
  }
}, { immediate: true })

watch(() => game.value.robotsTriggeredCount, (count) => {
  if (count > 0) {
    markRobotFound()
    unlockAchievement('techy')
  }
  if (count >= 5) {
    unlockAchievement('squad')
  }
}, { immediate: true })

// Traveler/Ultra Traveler : cumulatif toutes runs confondues, comme les
// jalons ci-dessus — jamais remis à false une fois débloqué (unlockAchievement
// no-op si déjà vrai).
watch(() => game.value.maxDistance, (distance) => {
  if (distance >= 100) {
    unlockAchievement('traveler')
  }
  if (distance >= 1000) {
    unlockAchievement('ultra-traveler')
  }
}, { immediate: true })

// Marathon : 42195 = distance d'un marathon en mètres, une case = un mètre.
watch(() => game.value.revealedCount, (count) => {
  if (count >= 42195) {
    unlockAchievement('marathon')
  }
}, { immediate: true })

// Iron Will : au moment précis où le plafond d'assombrissement devient
// atteignable (canGiveUp passe à vrai), pas heartsCollectedCount tout seul
// — sinon se déclencherait bien avant la fin, dès qu'un cœur manque.
watch(() => canGiveUp(game.value), (can) => {
  if (can && game.value.heartsCollectedCount === 0) {
    unlockAchievement('iron-will')
  }
})

// Pro/Ultra Pro/Noob : uniquement classic, sur la transition de statut plutôt
// qu'un guard interne à openCell (game.js reste pur, sans notion
// d'achievement — cf. discoveries.js/toastQueue.js, même principe).
watch(() => game.value.status, (status) => {
  if (game.value.mode !== "classic") {
    return
  }

  if (status === "won") {
    unlockAchievement('pro')

    if (!game.value.everFlagged) {
      unlockAchievement('ultra-pro')
    }
  } else if (status === "lost") {
    recordClassicLoss()
  }
})

const WIN_BANNER_DURATION_MS = 3000
const showWinBanner = ref(false)
const justUnlockedInfinite = ref(false)
let winBannerTimeout = null

function dismissWinBanner() {
  clearTimeout(winBannerTimeout)
  showWinBanner.value = false
  justUnlockedInfinite.value = false
  // Rend la main à la file d'achievements mise en pause quand le WinBanner
  // s'est affiché (no-op si elle ne l'était pas — reset de partie, etc.).
  resumeAchievementBanners()
}

// Auto-dismiss, 1.5x WinBanner (plus de texte à lire — titre + phrase, pas
// juste "YOU WIN") — filet de sécurité derrière le clic-n'importe-où déjà
// géré dans AchievementBanner.vue. Le timer vit ici (pas dans le composant)
// pour rester cohérent avec le pattern WinBanner/GameOverBanner déjà en place.
const ACHIEVEMENT_BANNER_DURATION_MS = WIN_BANNER_DURATION_MS * 1.5
let achievementBannerTimeout = null

watch(currentAchievementBanner, (achievement) => {
  clearTimeout(achievementBannerTimeout)

  if (achievement) {
    achievementBannerTimeout = setTimeout(dismissAchievementBanner, ACHIEVEMENT_BANNER_DURATION_MS)
  }
})

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

// Déblocage caché du mode 3 en cours de prototypage (roadmap point 10) : 8
// taps sur le titre en moins de DEV_TAP_WINDOW_MS chacun. Pas persisté — un
// reload referme l'accès, cohérent avec un bouton purement temporaire.
const DEV_TAP_COUNT = 8
const DEV_TAP_WINDOW_MS = 1500
const devUnlocked = ref(false)
let devTapCount = 0
let devTapTimeout = null

function onTitleTap() {
  if (devUnlocked.value) {
    return
  }

  devTapCount += 1
  clearTimeout(devTapTimeout)
  devTapTimeout = setTimeout(() => { devTapCount = 0 }, DEV_TAP_WINDOW_MS)

  if (devTapCount >= DEV_TAP_COUNT) {
    devUnlocked.value = true
  }
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
      // Le WinBanner prend l'emplacement : met en pause (et remise en tête
      // de file) tout achievement de victoire déjà affiché — 'pro' se
      // débloque dans un watcher antérieur, sur le même game.status.
      holdAchievementBanners()
      showWinBanner.value = true
      clearTimeout(winBannerTimeout)
      winBannerTimeout = setTimeout(dismissWinBanner, WIN_BANNER_DURATION_MS)
    }

    if (game.value.mode === "infinite" && status === "lost") {
      const { rank } = recordRun({
        revealedCount: game.value.revealedCount,
        distance: Math.round(game.value.maxDistance),
        minesTriggeredCount: game.value.minesTriggeredCount,
        heartsCollectedCount: game.value.heartsCollectedCount,
        robotsTriggeredCount: game.value.robotsTriggeredCount,
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
  zoomCellSize,
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

// En infini on rend deux colonnes/lignes de plus que ce qui tient à l'écran.
// Il faut couvrir DEUX fractions de case au bord bas/droit : le décalage
// fractionnaire (offsetX/offsetY) ET le reliquat containerHeight % cellSize
// (cellsDown = floor(...)). Avec une seule case de marge, quand les deux
// sont petits en même temps, le bord bas/droit se retrouve à découvert et la
// dernière rangée semble disparaître au lieu de rester partiellement visible
// comme sur les bords haut/gauche (eux toujours couverts par la 1re case
// rendue, ancrée à -offset).
const renderWidth = computed(() =>
  game.value.mode === "infinite" ? viewportWidth.value + 2 : game.value.width
)

const renderHeight = computed(() =>
  game.value.mode === "infinite" ? viewportHeight.value + 2 : game.value.height
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

// Case au centre du viewport : repère de position affiché dans le footer en
// mode infini (réglage showCoordinates). Comme flooredOriginX/Y, ces
// computed renvoient un entier et ne notifient donc qu'au franchissement
// d'une case, pas à chaque pixel de drag.
const centerCellX = computed(() => Math.floor(originX.value + viewportWidth.value / 2))
const centerCellY = computed(() => Math.floor(originY.value + viewportHeight.value / 2))

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
// game.pendingRobotTrails s'accumule dans game.js à chaque reveal qui
// déclenche un robot (clic direct, chord, ou cascade) — performReveal est le
// seul point de passage pour tout appel à revealCell, donc le seul endroit à
// vider après coup, plutôt que de dupliquer ce drain à chaque site d'appel.
function performReveal(cell) {
  // Revérifie la condition de revealCell juste pour distinguer ce refus
  // d'un no-op silencieux ordinaire et prévenir le joueur.
  if (isTooFarToReveal(game.value, cell)) {
    pushToast("Too far — reveal cells next to explored ground first")
    return
  }

  revealCell(game.value, cell)
  drainRobotTrails()
}

function drainRobotTrails() {
  if (game.value.pendingRobotTrails.length === 0) {
    return
  }

  const trails = game.value.pendingRobotTrails.splice(0, game.value.pendingRobotTrails.length)

  for (const { origin, trail } of trails) {
    animateRobotTrail(origin, trail)
  }
}

// Cadence (ms) entre deux cases de la marche d'un robot — le state est déjà
// résolu d'un coup côté game.js (cf. performRobotWalk), cette fonction ne
// fait que rejouer visuellement le trajet avec un décalage : à chaque tick,
// le sprite (cell.robotHere) avance d'une case du chemin, et la case qu'il
// atteint sort de son masquage (cell.pendingReveal, cf. MineCell.vue) pile à
// ce moment-là — sprite et révélation avancent ensemble, pas deux animations
// séparées. Contrairement à isRobot (vrai pour toujours sur la case
// d'origine), robotHere ne reste jamais : le sprite ne laisse rien derrière
// lui une fois la marche finie, il "disparaît" comme demandé.
const ROBOT_STEP_DELAY_MS = 440

// 2x la durée par défaut du toast (cf. toastQueue.js) : passée explicitement
// plutôt que de changer ce défaut, pour ne pas imposer ce timing à un futur
// usage générique (tuto) du même composable.
const ROBOT_TOAST_DURATION_MS = 2000

// Compteur (pas juste un booléen) : si deux robots se déclenchent dans la
// même cascade (cf. drainRobotTrails), leurs animations tournent en
// parallèle — les clics doivent rester bloqués tant qu'il en reste au moins
// une en cours, pas juste la première à se terminer.
const robotAnimationsActive = ref(0)

// Cases (coordonnées monde) des robots actuellement en marche, un par
// animation en cours (plusieurs si une cascade en déclenche plusieurs à la
// fois) — sert uniquement à positionner leur halo perce-brouillard (cf.
// robotHaloPositions), pas au state du jeu. Un id par animation plutôt que la
// cellule d'origine : deux robots pourraient partager la même origine dans un
// cas extrême (cascade), l'id garantit qu'on retire bien la bonne entrée.
let nextRobotHaloId = 0
const robotHaloCells = ref([])

// Convertit les coordonnées monde d'un robot en pixels écran relatifs au
// conteneur .game-area, avec la même formule que dangerLevel (cf. plus haut) :
// originX/Y est le coin haut-gauche du viewport en cases, donc (x - originX)
// * cellSize place le bord gauche de sa case, +cellSize/2 recentre sur elle.
const robotHaloPositions = computed(() =>
  robotHaloCells.value.map(({ id, x, y }) => ({
    id,
    x: (x - originX.value) * cellSize.value + cellSize.value / 2,
    y: (y - originY.value) * cellSize.value + cellSize.value / 2
  }))
)

// Repère d'origine renforcé pour la vue simplifiée, où ORIGIN_PIXELS (dessiné
// par MineCell.vue) devient trop discret — overlay séparé, même conversion
// monde→écran que robotHaloPositions ci-dessus.
const originMarkerPosition = computed(() => ({
  x: (0 - originX.value) * cellSize.value + cellSize.value / 2,
  y: (0 - originY.value) * cellSize.value + cellSize.value / 2
}))

// Perce un trou dans .fog-base pour chaque robot en marche, via mask-image
// plutôt que mix-blend-mode: contrairement à ce qu'on pourrait croire,
// "destination-out" n'existe pas comme valeur de mix-blend-mode (ce sont des
// mots-clés de compositing Porter-Duff, propres à mask-composite/canvas/SVG,
// pas aux blend modes CSS) — un premier essai avec mix-blend-mode laissait
// juste le halo se peindre normalement par-dessus le voile (d'où le rond
// noir constaté). Même dégradé en anneaux que le voile principal (cf.
// .game-area.infinite .fog-base plus bas dans le style), mais en alpha SEUL
// (la couleur n'a aucune importance pour un masque) : transparent au centre
// = case masquée = trou dans le voile, opaque au-delà du rayon = voile
// intact. Avec plusieurs robots actifs à la fois (cascade), mask-composite:
// intersect multiplie les canaux alpha entre calques — équivalent à un ET
// binaire sur des valeurs 0/1, donc union des trous (un point reste un trou
// dès qu'UN SEUL calque le dit transparent), commutatif donc indifférent à
// l'ordre des robots dans la liste.
const ROBOT_HALO_RADIUS = 'calc(var(--cell-size) * 1.5)'

function robotHaloMaskGradient(x, y) {
  return `radial-gradient(circle ${ROBOT_HALO_RADIUS} at ${x}px ${y}px,` +
    ' transparent 100%,' +
    ' rgb(0 0 0 / 0.25) 100%, rgb(0 0 0 / 0.25) 108%,' +
    ' rgb(0 0 0 / 0.5) 108%, rgb(0 0 0 / 0.5) 116%,' +
    ' rgb(0 0 0 / 0.75) 116%, rgb(0 0 0 / 0.75) 123%,' +
    ' rgb(0 0 0 / 1) 123%)'
}

const fogMaskStyle = computed(() => {
  if (robotHaloPositions.value.length === 0) {
    return {}
  }

  return {
    maskImage: robotHaloPositions.value.map(({ x, y }) => robotHaloMaskGradient(x, y)).join(', '),
    maskComposite: robotHaloPositions.value.map(() => 'intersect').join(', ')
  }
})

// Rappel caméra pendant l'exploration d'un robot : suit seulement s'il sort
// du viewport (pas en continu, ça donnerait le mal des transports sur une
// marche en zigzag), cadrage minimal plutôt qu'un recentrage complet, animé.
// Ne s'engage que si un seul robot marche à la fois (robotAnimationsActive
// === 1) — la position d'avant reste sauvegardée/restaurée pour toute la
// rafale si une cascade en déclenche plusieurs. Retour à cette position une
// fois la marche finie, seulement si elle n'est plus visible, avec un petit
// délai pour laisser voir la fin du trajet.
const ROBOT_FOLLOW_MARGIN = 2
const ROBOT_FOLLOW_TWEEN_MS = 300
const ROBOT_FOLLOW_RETURN_DELAY_MS = 500

let preRobotOriginX = null
let preRobotOriginY = null
let originTweenFrame = null
let robotReturnTimeout = null

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

// Annule tout tween en cours avant d'en lancer un autre, sinon deux boucles
// requestAnimationFrame concurrentes feraient dériver originX/Y.
function animateOriginTo(targetX, targetY, durationMs) {
  if (originTweenFrame !== null) {
    cancelAnimationFrame(originTweenFrame)
  }

  const startX = originX.value
  const startY = originY.value
  const startTime = performance.now()

  function tick(now) {
    const t = Math.min(1, (now - startTime) / durationMs)
    const eased = easeOutCubic(t)
    originX.value = startX + (targetX - startX) * eased
    originY.value = startY + (targetY - startY) * eased

    originTweenFrame = t < 1 ? requestAnimationFrame(tick) : null
  }

  originTweenFrame = requestAnimationFrame(tick)
}

// Un pan manuel doit toujours garder la main sur un tween auto (cf. onGridPan).
function cancelOriginTween() {
  if (originTweenFrame !== null) {
    cancelAnimationFrame(originTweenFrame)
    originTweenFrame = null
  }
}

// Même idée pour le délai avant un retour auto (cf. animateRobotTrail).
function cancelPendingRobotReturn() {
  if (robotReturnTimeout !== null) {
    clearTimeout(robotReturnTimeout)
    robotReturnTimeout = null
  }
}

function isPointInViewport(x, y) {
  return (
    x >= originX.value &&
    x < originX.value + viewportWidth.value &&
    y >= originY.value &&
    y < originY.value + viewportHeight.value
  )
}

// margin plafonné à un quart du viewport : évite un intervalle inversé si
// très zoomé (peu de cases visibles).
function clampFollowOrigin(cellCoord, currentOrigin, viewportSizeCells) {
  const margin = Math.min(ROBOT_FOLLOW_MARGIN, Math.floor(viewportSizeCells / 4))
  const leftBound = currentOrigin + margin
  const rightBound = currentOrigin + viewportSizeCells - margin - 1

  if (cellCoord < leftBound) {
    return currentOrigin - (leftBound - cellCoord)
  }

  if (cellCoord > rightBound) {
    return currentOrigin + (cellCoord - rightBound)
  }

  return currentOrigin
}

function followRobotIfNeeded(cell) {
  const targetX = clampFollowOrigin(cell.x, originX.value, viewportWidth.value)
  const targetY = clampFollowOrigin(cell.y, originY.value, viewportHeight.value)

  if (targetX !== originX.value || targetY !== originY.value) {
    animateOriginTo(targetX, targetY, ROBOT_FOLLOW_TWEEN_MS)
  }
}

function animateRobotTrail(origin, trail) {
  if (robotAnimationsActive.value === 0) {
    preRobotOriginX = originX.value
    preRobotOriginY = originY.value
  }

  robotAnimationsActive.value++
  pushToast("bip bop... starting exploration", { icon: ROBOT_PIXELS, durationMs: ROBOT_TOAST_DURATION_MS })

  const path = [origin, ...trail]

  for (const cell of trail) {
    cell.pendingReveal = true
  }

  path[0].robotHere = true

  const haloId = nextRobotHaloId++
  robotHaloCells.value.push({ id: haloId, x: path[0].x, y: path[0].y })

  let index = 0
  const interval = setInterval(() => {
    path[index].robotHere = false
    index++

    if (index >= path.length) {
      clearInterval(interval)
      pushToast("bop... [end of transmission]", { icon: ROBOT_PIXELS, durationMs: ROBOT_TOAST_DURATION_MS })
      robotAnimationsActive.value--
      robotHaloCells.value = robotHaloCells.value.filter((halo) => halo.id !== haloId)

      if (robotAnimationsActive.value === 0 && preRobotOriginX !== null) {
        // Centre de l'ancien viewport, pas son coin brut : plus représentatif
        // de "je vois encore à peu près où j'étais".
        const wasVisible = isPointInViewport(
          preRobotOriginX + viewportWidth.value / 2,
          preRobotOriginY + viewportHeight.value / 2
        )
        const targetX = preRobotOriginX
        const targetY = preRobotOriginY
        preRobotOriginX = null
        preRobotOriginY = null

        if (!wasVisible) {
          robotReturnTimeout = setTimeout(() => {
            robotReturnTimeout = null
            animateOriginTo(targetX, targetY, ROBOT_FOLLOW_TWEEN_MS)
          }, ROBOT_FOLLOW_RETURN_DELAY_MS)
        }
      }
      return
    }

    path[index].pendingReveal = false
    path[index].robotHere = true

    if (robotAnimationsActive.value === 1) {
      followRobotIfNeeded(path[index])
    }

    const halo = robotHaloCells.value.find((h) => h.id === haloId)
    halo.x = path[index].x
    halo.y = path[index].y
  }, ROBOT_STEP_DELAY_MS)
}

// Tant qu'un robot est en cours d'exploration à l'écran, les clics/taps sur
// la grille sont sans effet — le state du jeu est déjà résolu (cf.
// performRobotWalk dans game.js), mais laisser le joueur agir pendant que
// l'animation joue encore serait déroutant (des cases pourraient se révéler
// "avant leur tour" dans l'ordre visuel, ou un flag partir sur une case que
// le joueur croit encore cachée).
function onCellClick(cell) {
  if (robotAnimationsActive.value > 0) {
    return
  }

  if (cell.revealed) {
    performReveal(cell)
    return
  }

  if (tapAction.value === "flag") {
    toggleFlag(game.value, cell)
  } else {
    performReveal(cell)
  }
}

function onCellFlag(cell) {
  if (robotAnimationsActive.value > 0) {
    return
  }

  if (tapAction.value === "flag") {
    performReveal(cell)
  } else {
    toggleFlag(game.value, cell)
  }
}

const { clearRadiusX, clearRadiusY } = useFogOfWar(game, viewportWidth, viewportHeight, cellSize)

// Grille de points plutôt qu'un seul échantillon au centre : getDangerLevel
// plafonne (MAX_DENSITY) avant que l'œil ne perçoive une zone comme dense.
// Fractions du viewport (pas un nombre fixe de cases), donc proportionnel au
// zoom sans logique dédiée. Coût négligeable (pure maths, pas de cases).
const DANGER_SAMPLE_STEPS = 5

const dangerLevel = computed(() => {
  const currentGame = game.value
  const left = originX.value
  const top = originY.value
  const width = viewportWidth.value
  const height = viewportHeight.value

  let total = 0

  for (let i = 0; i < DANGER_SAMPLE_STEPS; i++) {
    for (let j = 0; j < DANGER_SAMPLE_STEPS; j++) {
      const sampleX = left + ((i + 0.5) / DANGER_SAMPLE_STEPS) * width
      const sampleY = top + ((j + 0.5) / DANGER_SAMPLE_STEPS) * height
      total += getDangerLevel(currentGame, sampleX, sampleY)
    }
  }

  return total / (DANGER_SAMPLE_STEPS * DANGER_SAMPLE_STEPS)
})

// Distinct de darkness (visuel, peut redescendre sous 1 grâce aux cœurs) :
// la possibilité d'abandonner ne dépend que du compteur brut de mines
// déclenchées, cf. canGiveUp dans game.js.
const showGiveUpButton = computed(() => canGiveUp(game.value))

// !== "playing" plutôt que === "lost" : reste correct si un futur statut
// de fin de partie s'ajoute (giveUp() est la seule sortie de "playing" en
// infini aujourd'hui, donc les deux se valent pour l'instant).
const showExportMapButton = computed(() => game.value.mode === "infinite" && game.value.status !== "playing")

const MAP_EXPORT_PX_PER_CELL = 6
const MAP_EXPORT_MAX_DIMENSION = 4000

function resolveThemeColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// Exporte un PNG de toute la carte explorée, au rendu "simplifié" (aplats de
// couleur, cf. .simplified-* dans MineCell.vue). Un <canvas> ne comprend pas
// var() : couleurs résolues une fois via getComputedStyle, pas par case.
function exportMapAsPng() {
  const touchedCells = [...game.value.cells.values()].filter((cell) => cell.revealed || cell.flagged)

  if (touchedCells.length === 0) {
    return
  }

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const cell of touchedCells) {
    minX = Math.min(minX, cell.x)
    maxX = Math.max(maxX, cell.x)
    minY = Math.min(minY, cell.y)
    maxY = Math.max(maxY, cell.y)
  }

  const widthCells = maxX - minX + 1
  const heightCells = maxY - minY + 1
  // Réduit px/case plutôt qu'un canvas démesuré sur une très longue run.
  const scale = Math.max(
    1,
    Math.min(MAP_EXPORT_PX_PER_CELL, Math.floor(MAP_EXPORT_MAX_DIMENSION / Math.max(widthCells, heightCells)))
  )

  const colors = {
    board: resolveThemeColor('--color-board-bg'),
    revealed: resolveThemeColor('--color-cell-revealed-bg'),
    flag: resolveThemeColor('--color-flag-cloth'),
    mine: resolveThemeColor('--color-wrong'),
    heart: resolveThemeColor('--color-heart')
  }

  const canvas = document.createElement('canvas')
  canvas.width = widthCells * scale
  canvas.height = heightCells * scale

  const ctx = canvas.getContext('2d')
  ctx.fillStyle = colors.board
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (const cell of touchedCells) {
    if (cell.flagged) {
      ctx.fillStyle = colors.flag
    } else if (cell.isMine) {
      ctx.fillStyle = colors.mine
    } else if (cell.isHeart) {
      ctx.fillStyle = colors.heart
    } else {
      ctx.fillStyle = colors.revealed
    }

    ctx.fillRect((cell.x - minX) * scale, (cell.y - minY) * scale, scale, scale)
  }

  canvas.toBlob((blob) => {
    if (!blob) {
      return
    }

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `hibol-minesweeper-map-${game.value.seed}.png`
    link.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

function onGiveUp() {
  giveUp(game.value)
}

// New Game n'est pas bloqué par robotAnimationsActive (contrairement aux
// clics sur la grille) : évite qu'un tween en vol anime vers une position
// qui n'a plus de sens pour la nouvelle partie.
function resetRobotFollowState() {
  cancelOriginTween()
  cancelPendingRobotReturn()
  preRobotOriginX = null
  preRobotOriginY = null
}

function startClassicGame() {
  // Le classic garde son zoom d'une partie classic à l'autre (cf.
  // startInfiniteGame), mais un zoom hérité d'une exploration infinie n'a
  // aucun sens sur un plateau classic tout neuf : on ne reset qu'à la
  // transition depuis l'infini, pas d'un classic à l'autre.
  if (game.value.mode === "infinite") {
    resetZoom()
  }
  clearActiveGame()
  game.value = createGame(10, 10, 20)
  resetRobotFollowState()
  dismissWinBanner()
  dismissGiveUpBanner()
}

const showInfiniteIntro = ref(false)

function dismissInfiniteIntro(dontShowAgain) {
  showInfiniteIntro.value = false
  if (dontShowAgain) {
    localStorage.setItem(SEEN_INFINITE_INTRO_KEY, "true")
  }
}

// Uniquement sur appareil tactile (cf. settings.js) : un joueur souris connaît
// déjà clic gauche/droit, ce popup n'a rien à lui apprendre. Déclenché au
// montage plutôt qu'au premier lancement d'une partie précise (contrairement
// à showInfiniteIntro) puisque le tap/long-press s'applique aux deux modes.
const showTapIntro = ref(false)

function dismissTapIntro(dontShowAgain) {
  showTapIntro.value = false
  if (dontShowAgain) {
    localStorage.setItem(SEEN_TAP_INTRO_KEY, "true")
  }
}

// Popup ouverte à la demande (bouton "?" du compteur concerné). Retient
// QUELLE case expliquer, pas juste un booléen : un seul dialog partagé.
const activeSpecialCellHelp = ref(null) // 'heart' | 'robot' | null

const SPECIAL_CELL_HELP = {
  heart: {
    pixels: HEART_PIXELS,
    name: 'HEART',
    description: 'Softens the fog — each heart found holds back the darkness a little longer.'
  },
  robot: {
    pixels: ROBOT_PIXELS,
    name: 'ROBOT',
    description: 'Wanders off on a short walk on its own, revealing a handful of nearby cells for you.'
  }
}

const specialCellHelpContent = computed(() => SPECIAL_CELL_HELP[activeSpecialCellHelp.value] ?? {})

function startInfiniteGame(
  seed = Date.now(),
  baseDensity = 0.15,
  densityScale = DEV_MODE3_DENSITY_SCALE,
  darknessMineThreshold = DEV_MODE3_DARKNESS_MINE_THRESHOLD
) {
  clearActiveGame()
  game.value = createInfiniteGame(seed, baseDensity, 1, 0.23, densityScale, darknessMineThreshold)
  // Avant resetZoom()/centerOn() : un tween de suivi robot encore en vol
  // continuerait sinon à écrire sur originX/Y à chaque frame après coup et
  // annulerait le centrage qu'on s'apprête à faire.
  resetRobotFollowState()
  // resetZoom() avant centerOn() : centerOn calcule l'origine à partir de
  // cellsAcross/cellsDown, qui dépendent de cellSize (cf. useViewportCamera)
  // — appelé dans l'autre sens, le centrage se ferait sur l'ancien zoom
  // hérité de la run précédente, puis resetZoom changerait cellSize sans
  // recalculer l'origine, laissant la vue décalée. Contrairement au classic
  // (qui garde le zoom d'une partie à l'autre, un réglage d'affichage plus
  // qu'un état de run), chaque run infinie repart d'une vue neutre : le zoom
  // d'une exploration passée n'a pas de raison de s'appliquer à un monde
  // tout neuf.
  resetZoom()
  centerOn(0, 0)
  dismissWinBanner()
  dismissGiveUpBanner()

  if (localStorage.getItem(SEEN_INFINITE_INTRO_KEY) !== "true") {
    showInfiniteIntro.value = true
  }
}

// Une run infinie encore en cours (pas déjà perdue/give up) et qui a dépassé
// l'ouverture automatique de départ (MAX_OPENING_REVEAL) représente une vraie
// progression du joueur, pas juste le patch offert au démarrage — l'écraser
// sans prévenir serait une perte silencieuse, jamais enregistrée dans le top
// puisque seul un "give up" y ajoute une run.
const pendingStart = ref(null) // 'classic' | 'infinite' | null
const pendingSeed = ref(null) // seed explicite (menu burger) pour la relance infinie en attente
// cf. DEV_MODE3_DENSITY_SCALE / DEV_MODE3_DARKNESS_MINE_THRESHOLD pour le bouton DEV
const pendingBaseDensity = ref(0.15)
const pendingDensityScale = ref(DEV_MODE3_DENSITY_SCALE)
const pendingDarknessMineThreshold = ref(DEV_MODE3_DARKNESS_MINE_THRESHOLD)

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

function requestStartInfiniteGame(
  seed,
  baseDensity = 0.15,
  densityScale = DEV_MODE3_DENSITY_SCALE,
  darknessMineThreshold = DEV_MODE3_DARKNESS_MINE_THRESHOLD
) {
  if (hasMeaningfulInfiniteRun()) {
    pendingStart.value = "infinite"
    pendingSeed.value = seed ?? null
    pendingBaseDensity.value = baseDensity
    pendingDensityScale.value = densityScale
    pendingDarknessMineThreshold.value = darknessMineThreshold
    return
  }
  startInfiniteGame(seed, baseDensity, densityScale, darknessMineThreshold)
}

function requestStartDevGame() {
  requestStartInfiniteGame(undefined, 0.15, DEV_MODE3_DENSITY_SCALE, DEV_MODE3_DARKNESS_MINE_THRESHOLD)
}

// Seul point de passage pour une seed explicitement choisie par le joueur
// (formulaire "PLAY A SEED", BurgerMenu.vue) plutôt qu'une seed aléatoire —
// le seul endroit où on peut distinguer les deux cas, donc le seul où
// débloquer Seed Hunter a du sens (requestStartInfiniteGame seul ne peut pas
// savoir si son paramètre seed a été fourni ou vient d'un défaut).
function onStartInfiniteWithSeed(seed) {
  unlockAchievement('seed-hunter')
  requestStartInfiniteGame(seed)
}

function confirmPendingStart() {
  if (pendingStart.value === "classic") {
    startClassicGame()
  } else if (pendingStart.value === "infinite") {
    startInfiniteGame(
      pendingSeed.value ?? undefined,
      pendingBaseDensity.value,
      pendingDensityScale.value,
      pendingDarknessMineThreshold.value
    )
  }
  pendingStart.value = null
  pendingSeed.value = null
  pendingBaseDensity.value = 0.15
  pendingDensityScale.value = DEV_MODE3_DENSITY_SCALE
  pendingDarknessMineThreshold.value = DEV_MODE3_DARKNESS_MINE_THRESHOLD
}

function cancelPendingStart() {
  pendingStart.value = null
  pendingSeed.value = null
  pendingBaseDensity.value = 0.15
  pendingDensityScale.value = DEV_MODE3_DENSITY_SCALE
  pendingDarknessMineThreshold.value = DEV_MODE3_DARKNESS_MINE_THRESHOLD
}

function onGridPan(dxPx, dyPx) {
  if (game.value.mode === "infinite") {
    cancelOriginTween()
    cancelPendingRobotReturn()
    pan(dxPx, dyPx)
  }
}

function onGridZoom(factor, clientX, clientY) {
  // Le classic n'a pas de caméra à faire suivre le point focal (grille fixe,
  // recentrée par le flex du conteneur) — cf. zoomCellSize dans
  // useViewportCamera.js pour pourquoi zoomBy y est faux.
  if (game.value.mode === "infinite") {
    zoomBy(factor, clientX, clientY)
  } else {
    zoomCellSize(factor)
  }
}

// Recentre sur l'origine sans toucher au zoom, animé (comme le suivi robot)
// plutôt qu'un centerOn instantané.
function centerOnOrigin() {
  cancelOriginTween()
  cancelPendingRobotReturn()
  animateOriginTo(0 - viewportWidth.value / 2, 0 - viewportHeight.value / 2, ROBOT_FOLLOW_TWEEN_MS)
}

// Persistance de la partie en cours : sur mobile, laisser l'app en arrière-
// plan la fait fréquemment recharger de zéro à la reprise (Chrome/Android
// tue les onglets en arrière-plan pour la mémoire) — sans ça, toute partie
// en cours non terminée est perdue. On ne sauvegarde qu'au moment où la page
// devient invisible (pas à chaque coup, ce serait un JSON.stringify inutile
// vu que ces mêmes infos ne servent qu'à ce moment précis) via
// visibilitychange (déclenche même sur un simple changement d'onglet) et
// pagehide en renfort (couvre les cas où visibilitychange ne se déclenche
// pas de façon fiable sur certains navigateurs mobiles).
function persistActiveGame() {
  saveActiveGame(game.value, {
    originX: originX.value,
    originY: originY.value,
    cellSize: cellSize.value
  })
}

function onVisibilityChange() {
  if (document.visibilityState === "hidden") {
    persistActiveGame()
  }
}

onMounted(() => {
  const snapshot = loadActiveGame()

  if (snapshot) {
    try {
      if (snapshot.mode === "classic") {
        game.value = restoreClassicGame(snapshot)
      } else if (snapshot.mode === "infinite") {
        game.value = restoreInfiniteGame(snapshot)
      }

      if (snapshot.camera) {
        originX.value = snapshot.camera.originX
        originY.value = snapshot.camera.originY
        cellSize.value = snapshot.camera.cellSize
      }
    } catch {
      // Snapshot corrompu, ou d'un format laissé par une version antérieure
      // du jeu : on repart sur la partie classic par défaut plutôt que de
      // planter l'appli au chargement.
      clearActiveGame()
    }
  }

  if (isTouchDevice && localStorage.getItem(SEEN_TAP_INTRO_KEY) !== "true") {
    showTapIntro.value = true
  }

  document.addEventListener("visibilitychange", onVisibilityChange)
  window.addEventListener("pagehide", persistActiveGame)
})

onUnmounted(() => {
  document.removeEventListener("visibilitychange", onVisibilityChange)
  window.removeEventListener("pagehide", persistActiveGame)
})

const RESET_STORAGE_PREFIX = "hibol-minesweeper:"

// Doit vivre ici plutôt que dans BurgerMenu.vue : persistActiveGame est
// câblé sur pagehide/visibilitychange (ci-dessus) pour survivre à un onglet
// tué en arrière-plan, et location.reload() déclenche justement pagehide —
// sans retirer ces listeners d'abord, la sauvegarde de la partie en cours
// se réécrivait dans localStorage juste après avoir été effacée, annulant
// silencieusement le reset.
function resetEverything() {
  document.removeEventListener("visibilitychange", onVisibilityChange)
  window.removeEventListener("pagehide", persistActiveGame)

  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(RESET_STORAGE_PREFIX)) {
      localStorage.removeItem(key)
    }
  }

  location.reload()
}
</script>

<template>
  <header class="app-header">
    <div class="header-menu-slot">
      <BurgerMenu
        :infinite-unlocked="infiniteUnlocked"
        @start-infinite-with-seed="onStartInfiniteWithSeed"
        @reset-everything="resetEverything"
      />
    </div>
    <h1 @click="onTitleTap">Hibol Minesweeper</h1>
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
      <button v-if="devUnlocked" class="pixel-btn" @click="requestStartDevGame">DEV</button>
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
    <div class="fog">
      <div class="fog-base" :style="fogMaskStyle"></div>
    </div>

    <div
      v-if="simplified"
      class="origin-reticle"
      :style="{ left: `${originMarkerPosition.x}px`, top: `${originMarkerPosition.y}px` }"
    >
      <div class="origin-reticle-tick origin-reticle-tick-up"></div>
      <div class="origin-reticle-tick origin-reticle-tick-down"></div>
      <div class="origin-reticle-tick origin-reticle-tick-left"></div>
      <div class="origin-reticle-tick origin-reticle-tick-right"></div>
      <svg viewBox="0 0 9 9" class="origin-reticle-ring" shape-rendering="crispEdges">
        <rect v-for="(p, i) in ORIGIN_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
      </svg>
    </div>

    <button v-if="simplified" class="home-btn pixel-btn" aria-label="Center on origin" @click="centerOnOrigin">
      <svg viewBox="0 0 9 9" class="home-btn-icon" shape-rendering="crispEdges">
        <rect v-for="(p, i) in HOME_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
      </svg>
    </button>

    <button v-if="showGiveUpButton" class="give-up pixel-btn" @click="onGiveUp">Give up</button>
    <!-- Même emplacement que "Give up" : mutuellement exclusifs. -->
    <button v-if="showExportMapButton" class="export-map pixel-btn" @click="exportMapAsPng">Export map</button>

    <WinBanner :show="showWinBanner" :just-unlocked="justUnlockedInfinite" @close="dismissWinBanner" />

    <AchievementBanner
      :show="currentAchievementBanner !== null"
      :title="currentAchievementBanner?.title"
      :description="currentAchievementBanner?.description"
      :pixels="currentAchievementBanner?.pixels"
      @close="dismissAchievementBanner"
    />

    <GameOverBanner
      :show="showGiveUpBanner"
      :revealed-count="game.revealedCount"
      :max-distance="Math.round(game.maxDistance)"
      :rank="giveUpRank"
      @close="dismissGiveUpBanner"
    />

    <ToastBanner />
  </main>

  <ConfirmDialog
    :show="!!pendingStart"
    title="DISCARD CURRENT RUN?"
    :message="`${game.revealedCount} cells explored will be lost`"
    confirm-label="Discard"
    @cancel="cancelPendingStart"
    @confirm="confirmPendingStart"
  />

  <IntroDialog
    :show="showInfiniteIntro"
    :title-lines="['INFINITE MINEFIELD...', 'IS IT PARADISE?']"
    message="Beware of the fog of war."
    @close="dismissInfiniteIntro"
  />
  <IntroDialog
    :show="showTapIntro"
    :title-lines="['HOW TO PLAY']"
    message="Tap to reveal a cell, long-press to flag it (swap it anytime in Settings)."
    @close="dismissTapIntro"
  />

  <SpecialCellsDialog
    :show="activeSpecialCellHelp !== null"
    :pixels="specialCellHelpContent.pixels"
    :name="specialCellHelpContent.name"
    :description="specialCellHelpContent.description"
    @close="activeSpecialCellHelp = null"
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
      <!-- Repère de position, opt-in (Settings). Coordonnée de la case au
           centre du viewport : suit le pan, au cran de case près. -->
      <span v-if="showCoordinates" class="stat">POS {{ centerCellX }},{{ centerCellY }}</span>
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
      <span v-if="game.heartsCollectedCount > 0" class="stat">
        <svg viewBox="0 0 9 9" class="stat-icon" shape-rendering="crispEdges">
          <rect v-for="(p, i) in HEART_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
        </svg>
        HEARTS {{ game.heartsCollectedCount }}
        <button
          v-if="showHelpButton"
          class="help-btn"
          aria-label="What does a heart do?"
          @click="activeSpecialCellHelp = 'heart'"
        >
          <svg viewBox="0 0 9 9" class="help-btn-icon" shape-rendering="crispEdges">
            <rect v-for="(p, i) in HELP_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
          </svg>
        </button>
      </span>
      <span v-if="game.robotsTriggeredCount > 0" class="stat">
        <svg viewBox="0 0 9 9" class="stat-icon" shape-rendering="crispEdges">
          <rect v-for="(p, i) in ROBOT_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
        </svg>
        ROBOTS {{ game.robotsTriggeredCount }}
        <button
          v-if="showHelpButton"
          class="help-btn"
          aria-label="What does a robot do?"
          @click="activeSpecialCellHelp = 'robot'"
        >
          <svg viewBox="0 0 9 9" class="help-btn-icon" shape-rendering="crispEdges">
            <rect v-for="(p, i) in HELP_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
          </svg>
        </button>
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

  <PwaUpdatePrompt />
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
  user-select: none; /* évite la sélection de texte pendant les 8 taps du déblocage DEV */
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

/* Pas de bordure propre : le badge pixel-art dessine déjà sa silhouette,
   une bordure carrée en plus ferait double cadre. */
.help-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  margin: -4px 0;
  background: none;
  border: none;
  cursor: pointer;
}

.help-btn-icon {
  width: 15px;
  height: 15px;
}

/* flex-wrap : sans ça la ligne déborde en largeur sur un écran étroit, même
   pattern que .sort-chips/.run-main dans BurgerMenu.vue. */
.stats-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
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

/* 20px = 70% de CELL_SIZE, même ratio que .icon dans MineCell.vue — la
   taille réelle d'une icône au zoom par défaut du jeu. */
.stat-icon {
  width: 20px;
  height: 20px;
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

/*
 * .fog remplace l'ancien ::after par un vrai élément : il fallait pouvoir
 * lui appliquer un mask-image dynamique (cf. fogMaskStyle, pour le halo des
 * robots ci-dessous) piloté depuis App.vue, ce qu'un pseudo-élément ne
 * permet pas via :style.
 */
.fog {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.fog-base {
  position: absolute;
  inset: 0;
}

.game-area.infinite .fog-base {
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

.give-up,
.export-map {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1;
}

/* left/top (JS) sont un point, pas un coin : chaque enfant se centre lui-même
   dessus via son propre transform. */
.origin-reticle {
  position: absolute;
  pointer-events: none;
  z-index: 1;
}

.origin-reticle-ring {
  position: absolute;
  left: 0;
  top: 0;
  transform: translate(-50%, -50%);
  width: calc(var(--cell-size) * 1.8);
  height: calc(var(--cell-size) * 1.8);
}

.origin-reticle-tick {
  position: absolute;
  background: var(--color-origin-ring);
}

/* Écart avant chaque trait (rayon anneau ~0.9 case) : garde le vide entre
   "O" et les "|"/"-" plutôt que de les souder. */
.origin-reticle-tick-up,
.origin-reticle-tick-down {
  left: 0;
  width: 2px;
  height: calc(var(--cell-size) * 0.5);
  transform: translateX(-50%);
}

.origin-reticle-tick-up {
  top: calc(var(--cell-size) * -1.6);
}

.origin-reticle-tick-down {
  top: calc(var(--cell-size) * 1.1);
}

.origin-reticle-tick-left,
.origin-reticle-tick-right {
  top: 0;
  height: 2px;
  width: calc(var(--cell-size) * 0.5);
  transform: translateY(-50%);
}

.origin-reticle-tick-left {
  left: calc(var(--cell-size) * -1.6);
}

.origin-reticle-tick-right {
  left: calc(var(--cell-size) * 1.1);
}

/* Coin opposé au give-up (bas-centre) et à l'origin-reticle (peut être
   n'importe où sur la grille) : bas-droite, à l'écart de tout le reste. */
.home-btn {
  position: absolute;
  bottom: 16px;
  right: 16px;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
}

.home-btn-icon {
  width: 18px;
  height: 18px;
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
