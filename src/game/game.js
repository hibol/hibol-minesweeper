const directions = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1]
]

function cellKey(x, y) {
    return `${x},${y}`
}

function hash(seed, x, y) {
    let h = (seed ^ (x * 374761393) ^ (y * 668265263)) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    h = h ^ (h >>> 16)
    return (h >>> 0) / 4294967296  // normalise en [0, 1)
}

export function isMineAt(seed, x, y, density) {
    return hash(seed, x, y) < density
}

export function createGrid(width, height) {
    const cells = new Map()
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            cells.set(cellKey(x, y), {
                x,
                y,
                isMine: false,
                revealed: false,
                flagged: false,
                wrong: false,
                neighborMines: 0,
                tiltDeg: 0
            })
        }
    }
    
    return cells
}

export function placeMines(cells, numberOfMines) {
    const cellList = [...cells.values()]
    let minesPlaced = 0
    
    while (minesPlaced < numberOfMines) {
        const randomIndex = Math.floor(Math.random() * cellList.length)
        const cell = cellList[randomIndex]
        
        if (!cell.isMine) {
            cell.isMine = true
            minesPlaced++
        }
    }
}

export function getCell(game, x, y) {
  const key = cellKey(x, y)

  if (!game.cells.has(key) && game.mode === "infinite") {
    game.cells.set(key, createInfiniteCell(game, x, y))
  }

  // Toujours relire via .get() : une Map réactive Vue n'enveloppe une valeur
  // en proxy réactif qu'à la lecture, pas au stockage — retourner la variable
  // locale renverrait un objet brut, invisible pour le système de réactivité.
  return game.cells.get(key)
}

function isInSafeZone(game, x, y) {
  if (!game.safeZone) {
    return false
  }

  return Math.abs(x - game.safeZone.x) <= 1 && Math.abs(y - game.safeZone.y) <= 1
}

const MAX_DENSITY = 0.25
// Distance (en cases) à laquelle la densité a comblé l'essentiel de l'écart
// entre la densité de base et MAX_DENSITY. Valeur à ajuster en jouant.
const DENSITY_SCALE = 60

// Pour que deux zones à la même distance de l'origine n'aient pas exactement
// la même densité (des anneaux parfaitement concentriques seraient visibles),
// on ajoute un bruit par bloc de cases plutôt que par case individuelle (un
// bruit par case donnerait juste un flicker aléatoire, pas une "poche"
// perceptible en jouant). Chaque coin de bloc a une valeur stable (bruit de
// valeur classique), et on interpole entre les 4 coins qui entourent (x, y) :
// sans ça, la densité sauterait brutalement à chaque frontière de bloc au
// lieu de monter/descendre progressivement en traversant une poche.
const DENSITY_CHUNK_SIZE = 24
// Amplitude à ajuster en jouant : avec l'interpolation, une valeur plus
// élevée qu'un simple bruit par bloc reste lisible (pas de cassure nette).
const DENSITY_JITTER = 0.045

function smoothstep(t) {
  return t * t * (3 - 2 * t)
}

// Bruit stable pour le coin de bloc (chunkX, chunkY), dans [-1, 1].
function chunkNoise(game, chunkX, chunkY) {
  return hash(game.seed + 1, chunkX, chunkY) * 2 - 1
}

function densityJitter(game, x, y) {
  const gx = x / DENSITY_CHUNK_SIZE
  const gy = y / DENSITY_CHUNK_SIZE
  const chunkX = Math.floor(gx)
  const chunkY = Math.floor(gy)
  const tx = smoothstep(gx - chunkX)
  const ty = smoothstep(gy - chunkY)

  const topLeft = chunkNoise(game, chunkX, chunkY)
  const topRight = chunkNoise(game, chunkX + 1, chunkY)
  const bottomLeft = chunkNoise(game, chunkX, chunkY + 1)
  const bottomRight = chunkNoise(game, chunkX + 1, chunkY + 1)

  const top = topLeft + (topRight - topLeft) * tx
  const bottom = bottomLeft + (bottomRight - bottomLeft) * tx
  const noise = top + (bottom - top) * ty

  return noise * DENSITY_JITTER
}

function densityAt(game, x, y) {
  const distance = Math.hypot(x, y)
  const ramped = MAX_DENSITY - (MAX_DENSITY - game.baseDensity) * Math.exp(-distance / DENSITY_SCALE)

  return Math.min(MAX_DENSITY, ramped + densityJitter(game, x, y))
}

// Fraction de la marge base -> plafond déjà parcourue à (x, y) : 0 au centre
// (à la densité de base), 1 une fois MAX_DENSITY atteinte. Sert de jauge
// "danger" pour l'UI, indépendante du hash de placement des mines.
export function getDangerLevel(game, x, y) {
  if (game.mode !== "infinite") {
    return 0
  }

  const density = densityAt(game, x, y)
  const level = (density - game.baseDensity) / (MAX_DENSITY - game.baseDensity)

  return Math.max(0, Math.min(1, level))
}

// Densité réelle (probabilité de mine) à une position donnée, exposée pour
// des consommateurs externes au moteur (ex. un solveur qui a besoin d'une
// vraie magnitude de risque, pas juste du niveau relatif de getDangerLevel).
export function getMineDensity(game, x, y) {
  if (game.mode !== "infinite") {
    return 0
  }

  return densityAt(game, x, y)
}

function isMineForGame(game, x, y) {
  return !isInSafeZone(game, x, y) && isMineAt(game.seed, x, y, densityAt(game, x, y))
}

function countMinesAround(game, x, y) {
  let count = 0

  for (const [dx, dy] of directions) {
    if (isMineForGame(game, x + dx, y + dy)) {
      count++
    }
  }

  return count
}

function createInfiniteCell(game, x, y) {
  return {
    x,
    y,
    isMine: isMineForGame(game, x, y),
    revealed: false,
    flagged: false,
    wrong: false,
    neighborMines: countMinesAround(game, x, y),
    tiltDeg: 0
  }
}


export function getNeighbors(game, cell) {
    const neighbors = []
    
    for (const [dx, dy] of directions) {
        const neighbor = getCell(
            game,
            cell.x + dx,
            cell.y + dy
        )
        
        if (neighbor) {
            neighbors.push(neighbor)
        }
    }
    
    return neighbors
}

export function countNeighborMines(game) {
    for (const cell of game.cells.values()) {
        let count = 0
        
        for (const [dx, dy] of directions) {
            const neighbor = getCell(
                game,
                cell.x + dx,
                cell.y + dy
            )
            
            if (neighbor?.isMine) {
                count++
            }
        }
        
        cell.neighborMines = count
    }
}

export function createGame(width, height, mineCount) {
    const game = {
        mode: "classic",
        width,
        height,
        mineCount,
        status: "playing",
        firstMove: true,
        cells: createGrid(width, height),
        revealedCount: 0,
        flaggedCount: 0,
        minesTriggeredCount: 0
    }
    
    placeMines(game.cells, mineCount)
    countNeighborMines(game)
    
    return game
}

export const MAX_OPENING_REVEAL = 60

export function createInfiniteGame(seed, baseDensity = 0.15) {
  let game

  do {
    game = {
      mode: "infinite",
      seed,
      baseDensity,
      status: "playing",
      firstMove: false,
      cells: new Map(),
      safeZone: { x: 0, y: 0 },
      revealedCount: 0,
      flaggedCount: 0,
      minesTriggeredCount: 0,
      maxDistance: 0
    }

    openCell(game, getCell(game, 0, 0))
    seed++
  } while (game.revealedCount > MAX_OPENING_REVEAL)

  return game
}

export function revealCell(game, cell) {
    if (game.status !== "playing") {
        return
    }
    
    if (cell.flagged) {
        return
    }
    
    if (cell.revealed) {
        revealAround(game, cell)
        return
    }
    
    if (game.firstMove) {
        game.firstMove = false
        ensureSafeZone(game, cell)
    }
    
    openCell(game, cell)
}

// Magnitude min/max (en degrés) du tilt : on exclut la zone proche de 0,
// sinon certaines cases héritent d'une rotation trop faible pour se voir.
const MIN_TILT_DEG = 5
const MAX_TILT_DEG = 15

// Rotation aléatoire (cosmétique, pas besoin d'être reproductible) donnée à
// tous les voisins non-mine d'une mine qui explose (révélés ou non), comme si
// le souffle les avait tous bousculés — les autres mines voisines ne
// tiltent pas. Ne touche jamais une case déjà tiltée (premier impact gagne).
function jostleNeighbors(game, cell) {
    const neighbors = getNeighbors(game, cell)

    for (const neighbor of neighbors) {
        if (!neighbor.isMine && neighbor.tiltDeg === 0) {
            const magnitude = MIN_TILT_DEG + Math.random() * (MAX_TILT_DEG - MIN_TILT_DEG)
            const sign = Math.random() < 0.5 ? -1 : 1
            neighbor.tiltDeg = sign * magnitude
        }
    }
}

function openCell(game, cell) {
    cell.revealed = true

    if (game.mode === "infinite") {
        game.maxDistance = Math.max(game.maxDistance, Math.hypot(cell.x, cell.y))
    }

    if (cell.isMine) {
        game.minesTriggeredCount++
        jostleNeighbors(game, cell)
        markWrong(game, cell)

        if (game.mode === "classic") {
            game.status = "lost"
            revealAllMines(game)
        }
        return
    }

    game.revealedCount++

    if (cell.neighborMines === 0) {
        revealNeighbors(game, cell)
    }
    
    if (game.mode === "classic") {
        checkVictory(game)
    }
}

function relocateMine(game, cell, excludedCells) {
    if (!cell.isMine) {
        return
    }
    
    const candidates = [...game.cells.values()].filter(
        other => !other.isMine && !excludedCells.includes(other)
    )
    
    const target = candidates[Math.floor(Math.random() * candidates.length)]
    
    cell.isMine = false
    target.isMine = true
}

function ensureSafeZone(game, cell) {
    const safeZone = [cell, ...getNeighbors(game, cell)]
    
    for (const safeCell of safeZone) {
        relocateMine(game, safeCell, safeZone)
    }
    
    countNeighborMines(game)
}



function checkVictory(game) {
    const safeCells = [...game.cells.values()].filter(cell => !cell.isMine)
    const allRevealed = safeCells.every(cell => cell.revealed)
    
    if (allRevealed) {
        game.status = "won"
    }
}

function markWrong(game, cell) {
    const neighbors = getNeighbors(game, cell)
    
    for (const neighbor of neighbors) {
        if (!neighbor.isMine && neighbor.flagged) {
            neighbor.wrong = true
        }
    }
}

function revealAllMines(game) {
    for (const cell of game.cells.values()) {
        if (cell.isMine && !cell.flagged) {
            cell.revealed = true
        }
    }
}

function revealAround(game, cell) {
    const neighbors = getNeighbors(game, cell)
    // Une mine déjà révélée (explosée en infini, le jeu continue) ne peut
    // plus être flaggée, mais elle est tout aussi "identifiée" qu'une mine
    // flaggée : elle doit compter pareil, sinon le chord reste bloqué à
    // jamais dès qu'une mine voisine a déjà sauté.
    const accountedForNeighbors = neighbors.filter(
        neighbor => neighbor.flagged || (neighbor.isMine && neighbor.revealed)
    )

    if (accountedForNeighbors.length === cell.neighborMines) {
        let triggeredMine = false

        for (const neighbor of neighbors) {
            if (!neighbor.revealed && !neighbor.flagged) {
                openCell(game, neighbor)

                if (neighbor.isMine) {
                    triggeredMine = true
                }
            }
        }

        // Le mauvais flag qui a fait croire le compte bon peut être voisin de
        // cette case chordée sans être voisin de la mine elle-même (les deux
        // ne sont voisins que d'un tiers commun) — le markWrong déclenché
        // dans openCell ne regarde qu'autour de la mine, donc on complète ici
        // avec le voisinage de la case chordée.
        if (triggeredMine) {
            markWrong(game, cell)
        }
    }
}

function revealNeighbors(game, cell) {
    const neighbors = getNeighbors(game, cell)
    
    for (const neighbor of neighbors) {
        if (!neighbor.revealed && !neighbor.flagged) {
            openCell(game, neighbor)
        }
    }
}

export function toggleFlag(game, cell) {
    if (cell.revealed) {
        return
    }

    if (game.status !== "playing") {
        return
    }

    cell.flagged = !cell.flagged
    game.flaggedCount += cell.flagged ? 1 : -1

    if (!cell.flagged) {
        cell.wrong = false
    }
}

// Nombre de mines déclenchées pour atteindre l'assombrissement maximal.
// Valeur à ajuster en jouant.
export const DARKNESS_MINE_THRESHOLD = 15

export function getDarkness(game) {
    if (game.mode !== "infinite" || game.status !== "playing") {
        return 0
    }

    return Math.min(1, game.minesTriggeredCount / DARKNESS_MINE_THRESHOLD)
}

export function giveUp(game) {
    if (game.mode !== "infinite" || getDarkness(game) < 1) {
        return
    }

    game.status = "lost"
}

export function getVisibleCells(game, originX, originY, viewportWidth, viewportHeight) {
  const visibleCells = []

  for (let y = 0; y < viewportHeight; y++) {
    for (let x = 0; x < viewportWidth; x++) {
      visibleCells.push(getCell(game, originX + x, originY + y))
    }
  }

  return visibleCells
}
