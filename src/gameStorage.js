// Un slot de sauvegarde par mode : "…:active-game:classic" / "…:active-game:
// infinite". Le mode 3 (DEV) tourne en mode:"infinite" en interne et partage
// donc le slot infinite. Ces slots servent à survivre à un reload / onglet tué
// en arrière-plan ET à garder une partie en pause quand on change de mode.
// Ancien slot unique, d'avant les slots par mode : "…:active-game" tout court.
// Les slots par mode sont "…:active-game:classic" / "…:active-game:infinite",
// donc suffixés — jamais la même clé. Migré une fois au montage.
const LEGACY_KEY = "hibol-minesweeper:active-game"
// Dernier mode joué : sert à savoir dans quel mode rouvrir l'app.
const LAST_MODE_KEY = "hibol-minesweeper:last-mode"

function slotKey(mode) {
  return `${LEGACY_KEY}:${mode}`
}

// "Touchée" : la seule notion qui a besoin d'être sauvegardée en infini,
// puisque isMine/isHeart/neighborMines sont recalculables depuis
// seed/densités (cf. createInfiniteCell) — une case jamais révélée/flaggée/
// tiltée ne porte aucune information que la seed ne redonne pas déjà.
function isTouchedCell(cell) {
  return cell.revealed || cell.flagged || cell.tiltDeg !== 0
}

// Ne garde que les champs qui varient réellement d'une case à l'autre pour
// une case touchée, pas isMine/isHeart/neighborMines (redondants avec la
// seed) ni x/y en double avec la clé de la Map.
function touchedCellSnapshot({ x, y, revealed, flagged, wrong, tiltDeg }) {
  return { x, y, revealed, flagged, wrong, tiltDeg }
}

// camera : { originX, originY, cellSize } — capturé à part de `game` (ce
// sont des refs de useViewportCamera, pas des champs du game lui-même) pour
// que reprendre une partie replace aussi la vue là où elle était.
export function saveActiveGame(game, camera) {
  const key = slotKey(game.mode)

  if (game.status !== "playing") {
    clearActiveGame(game.mode)
    return
  }

  const snapshot = game.mode === "classic"
    ? {
      mode: "classic",
      width: game.width,
      height: game.height,
      mineCount: game.mineCount,
      status: game.status,
      firstMove: game.firstMove,
      revealedCount: game.revealedCount,
      flaggedCount: game.flaggedCount,
      minesTriggeredCount: game.minesTriggeredCount,
      everFlagged: game.everFlagged,
      // Plateau classic petit et non déterministe (placeMines vient de
      // Math.random, pas d'une seed) : on sauvegarde chaque case en entier,
      // contrairement à l'infini ci-dessous.
      cells: [...game.cells.values()]
    }
    : {
      mode: "infinite",
      seed: game.seed,
      baseDensity: game.baseDensity,
      heartDensityScale: game.heartDensityScale,
      heartMinDensity: game.heartMinDensity,
      densityScale: game.densityScale,
      darknessMineThreshold: game.darknessMineThreshold,
      robotDensityScale: game.robotDensityScale,
      status: game.status,
      revealedCount: game.revealedCount,
      flaggedCount: game.flaggedCount,
      minesTriggeredCount: game.minesTriggeredCount,
      heartsCollectedCount: game.heartsCollectedCount,
      robotsTriggeredCount: game.robotsTriggeredCount,
      maxDistance: game.maxDistance,
      cells: [...game.cells.values()].filter(isTouchedCell).map(touchedCellSnapshot)
    }

  snapshot.camera = camera

  try {
    localStorage.setItem(key, JSON.stringify(snapshot))
  } catch {
    // localStorage plein ou indisponible (navigation privée sur certains
    // navigateurs) : tant pis pour la sauvegarde, la partie en cours n'est
    // pas affectée pour autant.
  }
}

export function loadActiveGame(mode) {
  try {
    const raw = localStorage.getItem(slotKey(mode))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearActiveGame(mode) {
  try {
    localStorage.removeItem(slotKey(mode))
  } catch {
    // idem saveActiveGame
  }
}

// Métadonnées légères d'un slot (pour le marqueur "en pause" des boutons de
// mode) sans exploiter tout le snapshot : renvoie null si le slot est vide ou
// si la partie qu'il contient n'est plus en cours.
export function peekActiveGame(mode) {
  const snapshot = loadActiveGame(mode)

  if (!snapshot || snapshot.status !== "playing") {
    return null
  }

  return { mode, revealedCount: snapshot.revealedCount ?? 0 }
}

export function getLastMode() {
  try {
    return localStorage.getItem(LAST_MODE_KEY)
  } catch {
    return null
  }
}

export function setLastMode(mode) {
  try {
    localStorage.setItem(LAST_MODE_KEY, mode)
  } catch {
    // idem saveActiveGame
  }
}

// Migration unique de l'ancien slot unique vers le slot de son mode. Ne touche
// pas un slot par mode déjà rempli. Appelée une fois au montage (App.vue).
export function migrateLegacyActiveGame() {
  let raw
  try {
    raw = localStorage.getItem(LEGACY_KEY)
  } catch {
    return
  }

  if (!raw) {
    return
  }

  try {
    const snapshot = JSON.parse(raw)

    if ((snapshot?.mode === "classic" || snapshot?.mode === "infinite") && !localStorage.getItem(slotKey(snapshot.mode))) {
      localStorage.setItem(slotKey(snapshot.mode), raw)
      // Sans last-mode (utilisateur d'avant cette clé), rouvrir dans le mode de
      // la partie migrée plutôt que de repartir sur classic et laisser la run
      // en pause sans que le joueur s'y attende.
      if (!getLastMode()) {
        setLastMode(snapshot.mode)
      }
    }
  } catch {
    // snapshot illisible : on l'abandonne silencieusement.
  }

  try {
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    // idem
  }
}
