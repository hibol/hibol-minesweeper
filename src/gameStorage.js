const STORAGE_KEY = "hibol-minesweeper:active-game"

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
  if (game.status !== "playing") {
    clearActiveGame()
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // localStorage plein ou indisponible (navigation privée sur certains
    // navigateurs) : tant pis pour la sauvegarde, la partie en cours n'est
    // pas affectée pour autant.
  }
}

export function loadActiveGame() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearActiveGame() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // idem saveActiveGame
  }
}
