import { describe, it, expect } from 'vitest'
import {
  LEGACY_PRESETS,
  createLegacyGame,
  restoreLegacyGame,
  isClassicLike,
  getCell,
  revealCell,
  toggleFlag,
} from './game.js'

// Le mode Legacy (démineur Windows chronométré) réutilise tout le moteur
// classic : placeMines aléatoire → tests d'INVARIANT.

describe('legacy — LEGACY_PRESETS', () => {
  it('dimensions et nombre de mines officiels', () => {
    expect(LEGACY_PRESETS.beginner).toEqual({ width: 9, height: 9, mineCount: 10 })
    expect(LEGACY_PRESETS.intermediate).toEqual({ width: 16, height: 16, mineCount: 40 })
    expect(LEGACY_PRESETS.expert).toEqual({ width: 30, height: 16, mineCount: 99 })
  })
})

describe('legacy — createLegacyGame', () => {
  it('pose le bon nombre de mines, mode "legacy", isClassicLike', () => {
    for (const [difficulty, preset] of Object.entries(LEGACY_PRESETS)) {
      const game = createLegacyGame(difficulty)
      const mines = [...game.cells.values()].filter((c) => c.isMine).length

      expect(mines).toBe(preset.mineCount)
      expect(game.cells.size).toBe(preset.width * preset.height)
      expect(game.mode).toBe('legacy')
      expect(game.difficulty).toBe(difficulty)
      expect(isClassicLike(game)).toBe(true)
    }
  })

  it('difficulté inconnue ⇒ preset beginner', () => {
    const game = createLegacyGame('does-not-exist')
    expect(game.width).toBe(9)
    expect(game.height).toBe(9)
    expect([...game.cells.values()].filter((c) => c.isMine).length).toBe(10)
  })
})

describe('legacy — restoreLegacyGame (round-trip)', () => {
  it('restaure chaque case, la difficulté, everFlagged et le status', () => {
    const original = createLegacyGame('intermediate')
    revealCell(original, getCell(original, 0, 0)) // consomme firstMove
    const hidden = [...original.cells.values()].filter((c) => !c.revealed).slice(0, 3)
    for (const c of hidden) toggleFlag(original, c)

    const snapshot = {
      mode: 'legacy',
      difficulty: original.difficulty,
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

    const restored = restoreLegacyGame(snapshot)

    expect(restored.mode).toBe('legacy')
    expect(restored.difficulty).toBe('intermediate')
    expect(restored.everFlagged).toBe(true)
    expect(restored.status).toBe(original.status)
    expect(restored.cells.size).toBe(16 * 16)

    for (const [key, cell] of original.cells) {
      const r = restored.cells.get(key)
      expect(r.isMine).toBe(cell.isMine)
      expect(r.revealed).toBe(cell.revealed)
      expect(r.flagged).toBe(cell.flagged)
      expect(r.neighborMines).toBe(cell.neighborMines)
    }
  })

  it('difficulté absente du snapshot ⇒ beginner par défaut', () => {
    const restored = restoreLegacyGame({
      mode: 'legacy',
      width: 9,
      height: 9,
      mineCount: 10,
      status: 'playing',
      firstMove: true,
      revealedCount: 0,
      flaggedCount: 0,
      minesTriggeredCount: 0,
      cells: [],
    })
    expect(restored.difficulty).toBe('beginner')
    expect(restored.everFlagged).toBe(false)
  })
})
