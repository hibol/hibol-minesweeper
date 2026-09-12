import { describe, it, expect } from 'vitest'
import {
  createGame,
  createInfiniteGame,
  createTreasureGame,
  restoreClassicGame,
  restoreInfiniteGame,
  restoreTreasureGame,
  getCell,
  getNeighbors,
  revealCell,
  toggleFlag,
  chestPositionFor,
  DEFAULT_DENSITY_SCALE,
  DEFAULT_DARKNESS_MINE_THRESHOLD,
} from './game.js'
import { isTouchedCell, touchedCellSnapshot } from '../gameStorage.js'

// Round-trips de sauvegarde. On construit le snapshot À LA MAIN avec les
// helpers exportés de gameStorage.js (isTouchedCell / touchedCellSnapshot) —
// c'est exactement ce que saveActiveGame écrit, mais sans dépendre de
// localStorage / jsdom ici.
//
// Point clé de l'infini/trésor : isMine / neighborMines ne sont PAS dans le
// snapshot — restore les RECALCULE via createInfiniteCell (déterministe depuis
// seed + densités). Les tests le vérifient en comparant à la partie d'origine.

// Révèle quelques cases en bord de poche + en drapeaute une, sur une partie
// infinite-like. Renvoie les clés touchées.
function touchSomeCells(game) {
  const revealedKeys = []
  const flaggedKeys = []

  for (const cell of [...game.cells.values()]) {
    if (!cell.revealed) continue
    const hidden = getNeighbors(game, cell).find((n) => !n.revealed && !n.flagged && !n.isMine)
    if (hidden && revealedKeys.length < 3) {
      revealCell(game, hidden)
      revealedKeys.push(`${hidden.x},${hidden.y}`)
    }
  }

  const toFlag = [...game.cells.values()].find((c) => !c.revealed && !c.flagged)
  if (toFlag) {
    toggleFlag(game, toFlag)
    flaggedKeys.push(`${toFlag.x},${toFlag.y}`)
  }

  return { revealedKeys, flaggedKeys }
}

function infiniteSnapshot(game) {
  return {
    mode: 'infinite',
    seed: game.seed,
    baseDensity: game.baseDensity,
    heartDensityScale: game.heartDensityScale,
    heartMinDensity: game.heartMinDensity,
    densityScale: game.densityScale,
    darknessMineThreshold: game.darknessMineThreshold,
    robotDensityScale: game.robotDensityScale,
    robotMinDensity: game.robotMinDensity,
    status: game.status,
    revealedCount: game.revealedCount,
    flaggedCount: game.flaggedCount,
    minesTriggeredCount: game.minesTriggeredCount,
    heartsCollectedCount: game.heartsCollectedCount,
    robotsTriggeredCount: game.robotsTriggeredCount,
    maxDistance: game.maxDistance,
    safeZones: game.safeZones,
    forcedSafeCells: game.forcedSafeCells,
    cells: [...game.cells.values()].filter(isTouchedCell).map(touchedCellSnapshot),
  }
}

describe('restore — round-trip infini', () => {
  it('restaure l’ensemble révélé/flaggé, les compteurs, safeZones ; recalcule isMine/neighborMines', () => {
    const original = createInfiniteGame(42)
    original.safeZones.push({ x: 60, y: 60 }) // poche Travel Machine à persister
    const { revealedKeys, flaggedKeys } = touchSomeCells(original)

    const restored = restoreInfiniteGame(infiniteSnapshot(original))

    // Même ensemble de cases révélées / flaggées.
    const revealedOf = (g) =>
      new Set([...g.cells.values()].filter((c) => c.revealed).map((c) => `${c.x},${c.y}`))
    const flaggedOf = (g) =>
      new Set([...g.cells.values()].filter((c) => c.flagged).map((c) => `${c.x},${c.y}`))

    expect(revealedOf(restored)).toEqual(revealedOf(original))
    expect(flaggedOf(restored)).toEqual(flaggedOf(original))
    for (const k of revealedKeys) expect(restored.cells.get(k).revealed).toBe(true)
    for (const k of flaggedKeys) expect(restored.cells.get(k).flagged).toBe(true)

    // Compteurs.
    expect(restored.revealedCount).toBe(original.revealedCount)
    expect(restored.flaggedCount).toBe(original.flaggedCount)
    expect(restored.minesTriggeredCount).toBe(original.minesTriggeredCount)
    expect(restored.maxDistance).toBe(original.maxDistance)
    expect(restored.safeZones).toEqual([{ x: 60, y: 60 }])

    // isMine / neighborMines RECALCULÉS et identiques à l'original.
    for (const [key, cell] of restored.cells) {
      expect(cell.isMine, `isMine @ ${key}`).toBe(original.cells.get(key).isMine)
      expect(cell.neighborMines, `nm @ ${key}`).toBe(original.cells.get(key).neighborMines)
    }

    // La safeZone persistée est honorée par le recalcul.
    expect(getCell(restored, 60, 60).isMine).toBe(false)
  })
})

describe('restore — round-trip trésor', () => {
  it('restaure tornadoCount → chest, chestFound, repose isChest, recalcule le plateau', () => {
    const original = createTreasureGame(11)
    const { revealedKeys } = touchSomeCells(original)

    const chestAt2 = chestPositionFor(original.seed, 2)
    const snapshot = {
      seed: original.seed,
      unlimitedLives: false,
      status: 'playing',
      tornadoCount: 2,
      chestFound: true,
      revealedCount: original.revealedCount,
      flaggedCount: original.flaggedCount,
      minesTriggeredCount: original.minesTriggeredCount,
      maxDistance: original.maxDistance,
      forcedSafeCells: original.forcedSafeCells,
      cells: [
        ...[...original.cells.values()]
          .filter((c) => c.revealed || c.flagged)
          .map((c) => ({ x: c.x, y: c.y, revealed: c.revealed, flagged: c.flagged })),
        // la case du coffre (position après 2 tornades) doit être "touchée"
        // pour que restore y repose isChest.
        { x: chestAt2.x, y: chestAt2.y, revealed: true, flagged: false },
      ],
    }

    const restored = restoreTreasureGame(snapshot)

    expect(restored.chest).toEqual(chestAt2)
    expect(restored.chestFound).toBe(true)
    const chestCell = restored.cells.get(`${chestAt2.x},${chestAt2.y}`)
    expect(chestCell.isChest).toBe(true)
    expect(chestCell.revealed).toBe(true)

    for (const k of revealedKeys) expect(restored.cells.get(k).revealed).toBe(true)
    expect(restored.revealedCount).toBe(original.revealedCount)
    expect(restored.tornadoCount).toBe(2)

    // Plateau recalculé : la zone 3x3 forcée sans mine suit tornadoCount = 2.
    for (let k = 0; k <= 2; k++) {
      const chest = chestPositionFor(original.seed, k)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          expect(getCell(restored, chest.x + dx, chest.y + dy).isMine, `k=${k}`).toBe(false)
        }
      }
    }
  })
})

describe('restore — round-trip classic', () => {
  it('restaure chaque case en entier, everFlagged et status', () => {
    const original = createGame(9, 9, 10)
    revealCell(original, getCell(original, 0, 0)) // fige les mines
    const someHidden = [...original.cells.values()].filter((c) => !c.revealed).slice(0, 2)
    for (const c of someHidden) toggleFlag(original, c)

    const snapshot = {
      mode: 'classic',
      width: original.width,
      height: original.height,
      mineCount: original.mineCount,
      status: original.status,
      firstMove: original.firstMove,
      revealedCount: original.revealedCount,
      flaggedCount: original.flaggedCount,
      minesTriggeredCount: original.minesTriggeredCount,
      everFlagged: original.everFlagged,
      cells: [...original.cells.values()],
    }

    const restored = restoreClassicGame(snapshot)

    expect(restored.cells.size).toBe(81)
    expect(restored.everFlagged).toBe(true)
    expect(restored.status).toBe(original.status)
    expect(restored.flaggedCount).toBe(original.flaggedCount)

    for (const [key, cell] of original.cells) {
      const r = restored.cells.get(key)
      expect(r.isMine).toBe(cell.isMine)
      expect(r.revealed).toBe(cell.revealed)
      expect(r.flagged).toBe(cell.flagged)
      expect(r.neighborMines).toBe(cell.neighborMines)
    }
  })
})

describe('restore — tolérance aux anciens formats', () => {
  it('snapshot infini sans robotsTriggeredCount / densityScale / safeZones ⇒ défauts', () => {
    const restored = restoreInfiniteGame({
      mode: 'infinite',
      seed: 5,
      baseDensity: 0.15,
      heartDensityScale: 1,
      heartMinDensity: 0.23,
      status: 'playing',
      revealedCount: 0,
      flaggedCount: 0,
      minesTriggeredCount: 0,
      heartsCollectedCount: 0,
      maxDistance: 0,
      cells: [],
    })

    expect(restored.robotsTriggeredCount).toBe(0)
    expect(restored.densityScale).toBe(DEFAULT_DENSITY_SCALE)
    expect(restored.darknessMineThreshold).toBe(DEFAULT_DARKNESS_MINE_THRESHOLD)
    expect(restored.robotMinDensity).toBe(0.23)
    expect(restored.safeZones).toEqual([])
    expect(restored.forcedSafeCells).toEqual([])
  })

  it('snapshot trésor quasi vide ⇒ défauts, pas de crash', () => {
    const restored = restoreTreasureGame({ seed: 3 })

    expect(restored.tornadoCount).toBe(0)
    expect(restored.chestFound).toBe(false)
    expect(restored.chest).toEqual(chestPositionFor(3, 0))
    expect(restored.status).toBeUndefined() // snapshot.status absent → tel quel
    expect(restored.cells.size).toBe(0)
    expect(restored.forcedSafeCells).toEqual([])
  })
})
