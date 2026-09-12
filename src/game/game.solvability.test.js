import { describe, it, expect } from 'vitest'
import {
  createInfiniteGame,
  restoreInfiniteGame,
  createTreasureGame,
  restoreTreasureGame,
  getCell,
  hasDeducibleFrontier,
} from './game.js'
import { isTouchedCell, touchedCellSnapshot } from '../gameStorage.js'

// roadmap point 5 : l'ouverture initiale d'une partie infinie (ou trésor, qui
// réutilise le même moteur) ne doit jamais être une poche totalement
// ambiguë (ex: bordure de "1" sans aucune case déductible).
// correctOpeningSolvability (game.js, appelée depuis createInfiniteGame ET
// createTreasureGame) corrige ça au besoin en forçant une case minée de la
// bordure en case sûre (game.forcedSafeCells) — jamais après coup pendant la
// partie, seulement à la génération initiale (cf. discussion).

// Construit un `game` minimal (pas besoin de createInfiniteGame/hash ici) :
// teste hasDeducibleFrontier en isolation, indépendamment de la génération.
function miniGame(cells) {
  const map = new Map()
  for (const cell of cells) {
    map.set(`${cell.x},${cell.y}`, {
      flagged: false,
      revealed: false,
      isMine: false,
      neighborMines: 0,
      ...cell,
    })
  }
  return { mode: 'mini-test', cells: map }
}

describe('hasDeducibleFrontier — logique du solveur (isolée de la génération)', () => {
  it('faux sur une contrainte "1 parmi 2 inconnues" sans rien d’autre pour trancher', () => {
    // R (révélée, "1") a deux voisines cachées A et B, aucune autre case
    // révélée ne contraint A ou B : impossible de dire laquelle est minée.
    const game = miniGame([
      { x: 0, y: 0, revealed: true, neighborMines: 1 },
      { x: 1, y: 0 }, // A, cachée
      { x: -1, y: 0 }, // B, cachée
    ])

    expect(hasDeducibleFrontier(game)).toBe(false)
  })

  it('vrai dès qu’une case révélée a exactement 0 mine restante parmi ses voisines cachées', () => {
    const game = miniGame([
      { x: 0, y: 0, revealed: true, neighborMines: 0 },
      { x: 1, y: 0 }, // sûre par déduction (remaining === 0)
    ])

    expect(hasDeducibleFrontier(game)).toBe(true)
  })

  it('vrai dès que le nombre de voisines cachées égale le nombre de mines restantes', () => {
    const game = miniGame([
      { x: 0, y: 0, revealed: true, neighborMines: 1 },
      { x: 1, y: 0 }, // seule voisine cachée ⇒ forcément la mine
    ])

    expect(hasDeducibleFrontier(game)).toBe(true)
  })

  it('vrai quand il n’y a aucune bordure révélée (rien à déduire, mais rien d’ambigu)', () => {
    expect(hasDeducibleFrontier(miniGame([]))).toBe(true)
  })
})

describe('createInfiniteGame — correction de l’ouverture initiale', () => {
  it('l’ouverture laisse toujours au moins une déduction possible, corrigée ou non', () => {
    for (let seed = 0; seed < 300; seed++) {
      const game = createInfiniteGame(seed)
      expect(hasDeducibleFrontier(game), `seed ${seed}`).toBe(true)
    }
  })

  it('une case forcée sûre n’est jamais une mine', () => {
    for (let seed = 0; seed < 300; seed++) {
      const game = createInfiniteGame(seed)
      for (const { x, y } of game.forcedSafeCells) {
        expect(getCell(game, x, y).isMine, `seed ${seed} @ (${x},${y})`).toBe(false)
      }
    }
  })

  it('ne corrige rien quand l’ouverture est déjà déductible (pas de sur-correction)', () => {
    // Trouve un seed dont l'ouverture n'a besoin d'aucune correction, et
    // vérifie qu'on n'y touche pas quand même.
    for (let seed = 0; seed < 300; seed++) {
      const game = createInfiniteGame(seed)
      if (game.forcedSafeCells.length === 0) {
        expect(hasDeducibleFrontier(game)).toBe(true)
        return
      }
    }
    throw new Error('aucun seed sans correction trouvé dans la plage testée')
  })
})

describe('correction de solvabilité — survit à un reload (round-trip save/restore)', () => {
  it('les chiffres déjà affichés ne changent pas après une restauration', () => {
    // seed 54 : le premier, dans la plage testée ci-dessus, dont l'ouverture
    // a besoin d'une correction (forcedSafeCells non vide) — pas un hasard
    // recherché à la main : trouvé dynamiquement pour ne pas dépendre d'un
    // nombre magique qui casserait si le tuning de densité change un jour.
    let original = null
    for (let seed = 0; seed < 300; seed++) {
      const candidate = createInfiniteGame(seed)
      if (candidate.forcedSafeCells.length > 0) {
        original = candidate
        break
      }
    }
    expect(original, 'aucun seed avec correction trouvé dans la plage testée').not.toBeNull()

    const snapshot = {
      mode: 'infinite',
      seed: original.seed,
      baseDensity: original.baseDensity,
      heartDensityScale: original.heartDensityScale,
      heartMinDensity: original.heartMinDensity,
      densityScale: original.densityScale,
      darknessMineThreshold: original.darknessMineThreshold,
      robotDensityScale: original.robotDensityScale,
      robotMinDensity: original.robotMinDensity,
      status: original.status,
      revealedCount: original.revealedCount,
      flaggedCount: original.flaggedCount,
      minesTriggeredCount: original.minesTriggeredCount,
      heartsCollectedCount: original.heartsCollectedCount,
      robotsTriggeredCount: original.robotsTriggeredCount,
      maxDistance: original.maxDistance,
      safeZones: original.safeZones,
      forcedSafeCells: original.forcedSafeCells,
      cells: [...original.cells.values()].filter(isTouchedCell).map(touchedCellSnapshot),
    }

    const restored = restoreInfiniteGame(snapshot)

    expect(restored.forcedSafeCells).toEqual(original.forcedSafeCells)

    // Chaque case révélée affiche le MÊME chiffre avant/après reload — pas
    // seulement les cases forcées sûres elles-mêmes, mais aussi leurs
    // voisines révélées dont neighborMines a été ajusté en mémoire au moment
    // de la correction (cf. correctOpeningSolvability).
    for (const cell of original.cells.values()) {
      if (!cell.revealed) continue
      const restoredCell = getCell(restored, cell.x, cell.y)
      expect(restoredCell.neighborMines, `(${cell.x},${cell.y})`).toBe(cell.neighborMines)
      expect(restoredCell.isMine, `(${cell.x},${cell.y})`).toBe(cell.isMine)
    }

    expect(hasDeducibleFrontier(restored)).toBe(true)
  })
})

// Génération plus coûteuse qu'en infini (openTreasureStart) : plage de seeds
// réduite (toujours assez pour trouver plusieurs corrections, cf. calibrage
// manuel) + timeout explicite plutôt que le défaut de 5s.
const TREASURE_SEED_SAMPLE = 150
const TREASURE_TEST_TIMEOUT = 15000

describe('createTreasureGame — correction de l’ouverture initiale (même moteur qu’infini)', () => {
  it('l’ouverture laisse toujours au moins une déduction possible, corrigée ou non', () => {
    for (let seed = 0; seed < TREASURE_SEED_SAMPLE; seed++) {
      const game = createTreasureGame(seed)
      expect(hasDeducibleFrontier(game), `seed ${seed}`).toBe(true)
    }
  }, TREASURE_TEST_TIMEOUT)

  it('une case forcée sûre n’est jamais une mine', () => {
    for (let seed = 0; seed < TREASURE_SEED_SAMPLE; seed++) {
      const game = createTreasureGame(seed)
      for (const { x, y } of game.forcedSafeCells) {
        expect(getCell(game, x, y).isMine, `seed ${seed} @ (${x},${y})`).toBe(false)
      }
    }
  }, TREASURE_TEST_TIMEOUT)

  it('les chiffres déjà affichés ne changent pas après une restauration', () => {
    // Plage de recherche plus large que TREASURE_SEED_SAMPLE : ici on a besoin
    // d'un seed précis qui déclenche une correction, pas d'un échantillon
    // large — le premier trouvé suffit, peu importe où.
    let original = null
    for (let seed = 0; seed < 300; seed++) {
      const candidate = createTreasureGame(seed)
      if (candidate.forcedSafeCells.length > 0) {
        original = candidate
        break
      }
    }
    expect(original, 'aucun seed avec correction trouvé dans la plage testée').not.toBeNull()

    const snapshot = {
      seed: original.seed,
      unlimitedLives: original.unlimitedLives,
      status: original.status,
      tornadoCount: original.tornadoCount,
      chestFound: original.chestFound,
      revealedCount: original.revealedCount,
      flaggedCount: original.flaggedCount,
      minesTriggeredCount: original.minesTriggeredCount,
      maxDistance: original.maxDistance,
      forcedSafeCells: original.forcedSafeCells,
      cells: [...original.cells.values()].filter(isTouchedCell).map(touchedCellSnapshot),
    }

    const restored = restoreTreasureGame(snapshot)

    expect(restored.forcedSafeCells).toEqual(original.forcedSafeCells)

    for (const cell of original.cells.values()) {
      if (!cell.revealed) continue
      const restoredCell = getCell(restored, cell.x, cell.y)
      expect(restoredCell.neighborMines, `(${cell.x},${cell.y})`).toBe(cell.neighborMines)
      expect(restoredCell.isMine, `(${cell.x},${cell.y})`).toBe(cell.isMine)
    }

    expect(hasDeducibleFrontier(restored)).toBe(true)
  }, TREASURE_TEST_TIMEOUT)
})
