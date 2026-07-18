// Bot de simulation pour tuner les paramètres de jeu (densité, seuil
// d'assombrissement...) sans avoir à jouer des dizaines de parties à la main.
// Usage : node scripts/autoplay.js --games=200 --mode=infinite --errorRate=0.1 [--verbose]
//         node scripts/autoplay.js --games=1 --render=grid.svg   (visualiser la dernière grille)
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import {
  createGame,
  createInfiniteGame,
  getCell,
  getNeighbors,
  revealCell,
  toggleFlag,
  getDarkness,
  giveUp,
  getMineDensity
} from '../src/game/game.js'

// Les rendus sont jetables (utiles pour inspecter une partie, pas pour être
// versionnés) : toujours écrits ici quel que soit le chemin passé à
// --render (seul le nom de fichier est gardé), et ce dossier est gitignore.
const RENDER_DIR = join(dirname(fileURLToPath(import.meta.url)), 'renders')

const DEFAULTS = {
  games: 100,
  mode: 'infinite',
  errorRate: 0,
  maxMoves: 3000,
  seed: Date.now(),
  baseDensity: 0.15,
  width: 10,
  height: 10,
  mineCount: 25,
  verbose: false,
  render: null
}

function parseArgs(argv) {
  const options = { ...DEFAULTS }

  for (const arg of argv) {
    if (arg === '--verbose') {
      options.verbose = true
      continue
    }

    const match = arg.match(/^--([a-zA-Z]+)=(.+)$/)
    if (!match) continue

    const [, key, rawValue] = match
    if (!(key in DEFAULTS)) continue

    options[key] = typeof DEFAULTS[key] === 'number' ? Number(rawValue) : rawValue
  }

  return options
}

function mulberry32(seed) {
  let a = seed >>> 0

  return function rng() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// game.cells ne fait que grossir (aucune case n'est jamais retirée, cf.
// getCell), donc rescanner game.cells.values() à chaque coup coûterait
// O(historique total) au lieu de O(bordure actuelle) — sur une partie de
// quelques centaines de coups ça devient vite non jouable. `frontier` (Set
// des cases révélées non-mine ayant encore un voisin non résolu) est donc
// tenu à jour de façon incrémentale par markChanged, jamais rescanné en
// entier : solveDeterministic et frontierCandidates ne parcourent que lui.

function markResolved(game, cell, frontier) {
  if (!cell.revealed || cell.isMine) return

  const hasUnresolved = getNeighbors(game, cell).some(n => !n.revealed && !n.flagged)

  if (hasUnresolved) {
    frontier.add(cell)
  } else {
    frontier.delete(cell)
  }
}

// À appeler sur toute case dont l'état (revealed/flagged) vient de changer :
// remet à jour son propre statut de frontière, et celui de ses voisines déjà
// révélées (dont le compte de voisins non résolus vient de bouger). `walked`
// est un Set persistant pour toute la partie : une case révélée n'a besoin
// d'être explorée (pour continuer la cascade) qu'une seule fois dans sa vie,
// même si son statut de frontière est réévalué plusieurs fois par la suite
// via les voisins.
function markChanged(game, startCell, frontier, walked) {
  const stack = [startCell]

  while (stack.length > 0) {
    const cell = stack.pop()
    const neighbors = getNeighbors(game, cell)

    for (const neighbor of neighbors) {
      markResolved(game, neighbor, frontier)
    }

    if (cell.revealed) {
      markResolved(game, cell, frontier)

      if (!walked.has(cell)) {
        walked.add(cell)
        for (const neighbor of neighbors) {
          if (neighbor.revealed && !walked.has(neighbor)) {
            stack.push(neighbor)
          }
        }
      }
    }
  }
}

// Propage les déductions "case sûre" / "case forcément minée" case par case
// jusqu'à point fixe, en ne regardant que la bordure actuelle. Ne regarde
// jamais .isMine d'une case non révélée : les mines déduites viennent
// uniquement de neighborMines / flagged des cases déjà révélées, comme un
// vrai joueur.
function solveDeterministic(game, frontier) {
  const safe = new Set()
  const mines = new Set()
  let changed = true

  while (changed) {
    changed = false

    for (const cell of frontier) {
      const neighbors = getNeighbors(game, cell)
      const unresolved = neighbors.filter(
        n => !n.revealed && !n.flagged && !safe.has(n) && !mines.has(n)
      )
      if (unresolved.length === 0) continue

      // Une mine révélée (explosée via un coup "erreur"/guess en mode
      // infini, sans avoir été flaggée) compte tout autant qu'une mine
      // flaggée : ne pas la compter faussait `remaining` pour les cases
      // voisines et provoquait des fausses déductions "sûres" en cascade.
      const knownMineNeighbors = neighbors.filter(
        n => n.flagged || mines.has(n) || (n.revealed && n.isMine)
      ).length
      const remaining = cell.neighborMines - knownMineNeighbors

      if (remaining === 0) {
        for (const n of unresolved) {
          if (!safe.has(n)) {
            safe.add(n)
            changed = true
          }
        }
      } else if (remaining === unresolved.length) {
        for (const n of unresolved) {
          if (!mines.has(n)) {
            mines.add(n)
            changed = true
          }
        }
      }
    }
  }

  return { safe: [...safe], mines: [...mines] }
}

// Cases jouables : voisines non révélées/non flaggées d'une case de la
// bordure actuelle.
function frontierCandidates(game, frontier) {
  const seen = new Set()
  const candidates = []

  for (const cell of frontier) {
    for (const neighbor of getNeighbors(game, cell)) {
      if (!neighbor.revealed && !neighbor.flagged && !seen.has(neighbor)) {
        seen.add(neighbor)
        candidates.push(neighbor)
      }
    }
  }

  return candidates
}

function estimateMineProbability(game, cell) {
  const localEstimates = []

  for (const neighbor of getNeighbors(game, cell)) {
    if (!neighbor.revealed || neighbor.isMine) continue

    const neighborNeighbors = getNeighbors(game, neighbor)
    const unresolved = neighborNeighbors.filter(n => !n.revealed && !n.flagged)
    if (unresolved.length === 0) continue

    const flaggedCount = neighborNeighbors.filter(n => n.flagged).length
    const remaining = neighbor.neighborMines - flaggedCount
    localEstimates.push(Math.max(0, Math.min(1, remaining / unresolved.length)))
  }

  if (localEstimates.length > 0) {
    return average(localEstimates)
  }

  return fallbackProbability(game, cell)
}

// Une case en bordure de zone révélée mais sans contrainte locale utile
// (isolée entre deux zones vides) retombe sur le taux "de base" : la
// densité réelle en infini, le ratio mines restantes / cases restantes en
// classic (grille bornée, dénombrable directement).
function fallbackProbability(game, cell) {
  if (game.mode === 'infinite') {
    return getMineDensity(game, cell.x, cell.y)
  }

  const allCells = [...game.cells.values()]
  const remainingMines = game.mineCount - allCells.filter(c => c.flagged).length
  const remainingUnrevealed = allCells.filter(c => !c.revealed && !c.flagged).length

  return remainingUnrevealed > 0 ? remainingMines / remainingUnrevealed : 0
}

function bestGuess(game, candidates) {
  let best = candidates[0]
  let bestProbability = Infinity

  for (const cell of candidates) {
    const probability = estimateMineProbability(game, cell)
    if (probability < bestProbability) {
      bestProbability = probability
      best = cell
    }
  }

  return { cell: best, probability: bestProbability }
}

function bootstrapCell(game, options) {
  if (game.mode === 'classic') {
    return getCell(game, Math.floor(options.width / 2), Math.floor(options.height / 2))
  }

  return getCell(game, 0, 0)
}

// Un "tour" = une action de reveal (le flag des mines déduites est gratuit,
// c'est de la tenue à jour, pas une prise de risque). errorRate simule la
// distraction : au lieu du coup déduit/du meilleur guess, une case au
// hasard parmi les cases jouables est cliquée, mine ou pas.
function step(game, rng, options, stats, frontier, walked) {
  const { safe, mines } = solveDeterministic(game, frontier)

  for (const cell of mines) {
    if (!cell.flagged) {
      toggleFlag(game, cell)
      markChanged(game, cell, frontier, walked)
    }
  }

  let candidates = frontierCandidates(game, frontier)
  let bootstrap = false

  if (candidates.length === 0) {
    if (game.revealedCount === 0) {
      candidates = [bootstrapCell(game, options)]
      bootstrap = true
    } else {
      return false
    }
  }

  const isError = !bootstrap && rng() < options.errorRate
  let target
  let kind

  if (bootstrap) {
    target = candidates[0]
    kind = 'bootstrap'
  } else if (isError) {
    target = candidates[Math.floor(rng() * candidates.length)]
    kind = 'error'
    stats.errors++
    stats.riskyMoves++
  } else if (safe.length > 0) {
    target = safe[0]
    kind = 'deterministic'
  } else {
    const guess = bestGuess(game, candidates)
    target = guess.cell
    kind = 'guess'
    stats.guesses++
    stats.riskyMoves++
    stats.guessProbabilities.push(guess.probability)
  }

  const wasMine = target.isMine
  revealCell(game, target)
  markChanged(game, target, frontier, walked)
  stats.moves++

  if (kind === 'deterministic' && wasMine) {
    stats.deterministicMineHits++
  }

  return true
}

function maxDistanceRevealed(game) {
  let max = 0

  for (const cell of game.cells.values()) {
    if (cell.revealed) {
      max = Math.max(max, Math.hypot(cell.x, cell.y))
    }
  }

  return max
}

const CELL_SIZE = 14

// Rend uniquement les cases révélées/flaggées (celles jamais touchées
// n'apportent rien à l'inspection visuelle) sur un canevas juste assez grand
// pour les contenir. SVG plutôt qu'un vrai format image : aucune dépendance
// à installer, du texte pur, ouvrable directement dans un navigateur.
function renderGridSvg(game) {
  const cells = [...game.cells.values()].filter(c => c.revealed || c.flagged)
  if (cells.length === 0) return null

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const cell of cells) {
    minX = Math.min(minX, cell.x)
    minY = Math.min(minY, cell.y)
    maxX = Math.max(maxX, cell.x)
    maxY = Math.max(maxY, cell.y)
  }

  const width = (maxX - minX + 1) * CELL_SIZE
  const height = (maxY - minY + 1) * CELL_SIZE
  const shapes = []

  for (const cell of cells) {
    const px = (cell.x - minX) * CELL_SIZE
    const py = (cell.y - minY) * CELL_SIZE

    if (cell.revealed && cell.isMine) {
      shapes.push(`<rect x="${px}" y="${py}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="#d33"/>`)
    } else if (cell.revealed) {
      shapes.push(`<rect x="${px}" y="${py}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="#ddd" stroke="#bbb" stroke-width="0.5"/>`)
      if (cell.neighborMines > 0) {
        shapes.push(
          `<text x="${px + CELL_SIZE / 2}" y="${py + CELL_SIZE * 0.75}" font-size="${CELL_SIZE * 0.7}" text-anchor="middle" font-family="monospace" fill="#333">${cell.neighborMines}</text>`
        )
      }
    } else if (cell.flagged) {
      shapes.push(`<rect x="${px}" y="${py}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="#fc9" stroke="#bbb" stroke-width="0.5"/>`)
    }
  }

  // Repère visuel sur (0, 0) : c'est le point dont dépend toute la courbe de
  // densité (cf. densityAt dans game.js), donc utile pour juger la forme de
  // la zone explorée par rapport à l'origine. N'a de sens qu'en infini —
  // (0, 0) n'est qu'une case de coin ordinaire en classic.
  if (game.mode === 'infinite' && minX <= 0 && 0 <= maxX && minY <= 0 && 0 <= maxY) {
    const ox = (0 - minX) * CELL_SIZE + CELL_SIZE / 2
    const oy = (0 - minY) * CELL_SIZE + CELL_SIZE / 2
    shapes.push(`<circle cx="${ox}" cy="${oy}" r="${CELL_SIZE * 0.4}" fill="none" stroke="#06c" stroke-width="2"/>`)
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<rect width="${width}" height="${height}" fill="#fff"/>
${shapes.join('\n')}
</svg>
`
}

// \r plutôt que console.log : réécrit la même ligne au lieu d'en empiler
// une toutes les 50 coups, ce qui serait illisible sur une partie à
// plusieurs milliers de coups.
function printProgress(gameIndex, totalGames, move, maxMoves) {
  process.stdout.write(`\rGame ${gameIndex + 1}/${totalGames}  move ${move}/${maxMoves}   `)
}

// Insère la seed juste avant l'extension (grid.svg -> grid-1234.svg) pour
// que le fichier s'auto-documente et que deux rendus successifs ne
// s'écrasent pas silencieusement l'un l'autre.
function withSeedSuffix(path, seed) {
  if (seed === undefined) return path

  const dot = path.lastIndexOf('.')
  return dot === -1 ? `${path}-${seed}` : `${path.slice(0, dot)}-${seed}${path.slice(dot)}`
}

function playGame(options, renderPath) {
  const game = options.mode === 'classic'
    ? createGame(options.width, options.height, options.mineCount)
    : createInfiniteGame(options.seed, options.baseDensity)

  const stats = {
    moves: 0,
    guesses: 0,
    errors: 0,
    riskyMoves: 0,
    deterministicMineHits: 0,
    guessProbabilities: [],
    movesToCap: null
  }

  const frontier = new Set()
  const walked = new Set()

  // createInfiniteGame ouvre déjà (0, 0) (et sa cascade éventuelle) avant de
  // rendre la main : il faut amorcer frontier/walked sur cette zone avant la
  // première itération, sinon le premier appel à step() la croit vide.
  if (options.mode === 'infinite') {
    markChanged(game, getCell(game, 0, 0), frontier, walked)
  }

  let cappedOut = false
  let finalDarkness = 0

  while (game.status === 'playing' && stats.moves < options.maxMoves) {
    const played = step(game, options.rng, options, stats, frontier, walked)
    if (!played) break

    if (stats.moves % 50 === 0) {
      printProgress(options.gameIndex, options.games, stats.moves, options.maxMoves)
    }

    if (options.mode === 'infinite') {
      const darkness = getDarkness(game)
      finalDarkness = darkness

      if (darkness >= 1) {
        if (stats.movesToCap === null) stats.movesToCap = stats.moves
        giveUp(game)
        cappedOut = true
        break
      }
    }
  }

  printProgress(options.gameIndex, options.games, stats.moves, options.maxMoves)

  if (renderPath) {
    const svg = renderGridSvg(game)
    if (svg) {
      const finalPath = withSeedSuffix(join(RENDER_DIR, basename(renderPath)), game.seed)
      mkdirSync(RENDER_DIR, { recursive: true })
      writeFileSync(finalPath, svg)
      console.log(`Grid rendered to ${finalPath}`)
    }
  }

  return {
    mode: game.mode,
    status: game.status,
    cappedOut,
    moves: stats.moves,
    revealedCount: game.revealedCount,
    flaggedCount: game.flaggedCount,
    minesTriggeredCount: game.minesTriggeredCount,
    guesses: stats.guesses,
    errors: stats.errors,
    riskyMoves: stats.riskyMoves,
    deterministicMineHits: stats.deterministicMineHits,
    avgGuessProbability: average(stats.guessProbabilities),
    movesToCap: stats.movesToCap,
    maxDistance: options.mode === 'infinite' ? maxDistanceRevealed(game) : null,
    finalDarkness
  }
}

function average(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

function round(n) {
  return n === null || n === undefined ? n : Math.round(n * 100) / 100
}

function summarize(results, field) {
  const values = results
    .map(r => r[field])
    .filter(v => v !== null && v !== undefined && !Number.isNaN(v))

  if (values.length === 0) return null

  values.sort((a, b) => a - b)
  const sum = values.reduce((a, b) => a + b, 0)

  return {
    mean: sum / values.length,
    median: values[Math.floor(values.length / 2)],
    min: values[0],
    max: values[values.length - 1],
    p90: values[Math.floor(values.length * 0.9)]
  }
}

function printSummary(results, options) {
  console.log(`\n${results.length} game(s) — mode=${options.mode} errorRate=${options.errorRate}`)

  const fields = options.mode === 'infinite'
    ? ['moves', 'revealedCount', 'flaggedCount', 'minesTriggeredCount', 'guesses', 'riskyMoves', 'avgGuessProbability', 'movesToCap', 'maxDistance']
    : ['moves', 'revealedCount', 'flaggedCount', 'minesTriggeredCount', 'guesses', 'riskyMoves', 'avgGuessProbability']

  const table = {}
  for (const field of fields) {
    const stat = summarize(results, field)
    if (stat) {
      table[field] = {
        mean: round(stat.mean),
        median: round(stat.median),
        min: round(stat.min),
        max: round(stat.max),
        p90: round(stat.p90)
      }
    }
  }
  console.table(table)

  if (options.mode === 'classic') {
    const wins = results.filter(r => r.status === 'won').length
    console.log(`Win rate: ${((wins / results.length) * 100).toFixed(1)}%`)
  } else {
    const capped = results.filter(r => r.cappedOut).length
    console.log(`Reached darkness cap: ${((capped / results.length) * 100).toFixed(1)}%`)
  }

  const deterministicMineHits = results.reduce((sum, r) => sum + r.deterministicMineHits, 0)
  if (deterministicMineHits > 0) {
    console.warn(`Warning: ${deterministicMineHits} "safe" move(s) actually hit a mine — solveDeterministic likely has a bug.`)
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const rng = mulberry32(options.seed)
  const results = []

  for (let i = 0; i < options.games; i++) {
    const isLast = i === options.games - 1
    const result = playGame({ ...options, seed: options.seed + i, rng, gameIndex: i }, isLast ? options.render : null)
    results.push(result)
  }

  process.stdout.write('\n')

  if (options.verbose) {
    console.table(results)
  }

  printSummary(results, options)
}

main()
