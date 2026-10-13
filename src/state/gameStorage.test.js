// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { saveActiveGame, loadActiveGame } from "./gameStorage.js"
import {
  createInfiniteGame,
  restoreInfiniteGame,
  getCell,
  revealCell,
  toggleFlag,
} from "../game/game.js"
import { resetWriteWarning } from "./storageWrite.js"
import { currentToast } from "./toastQueue.js"

const CAMERA = { originX: 0, originY: 0, cellSize: 28 }

beforeEach(() => {
  localStorage.clear()
})

describe("gameStorage — réglages de densité des robots", () => {
  it("robotMinDensity est sauvé et restauré", () => {
    const game = createInfiniteGame(7)
    game.robotMinDensity = 0.4
    game.robotDensityScale = 2

    saveActiveGame(game, CAMERA)
    const snapshot = loadActiveGame("infinite")
    const restored = restoreInfiniteGame(snapshot)

    expect(snapshot.robotMinDensity).toBe(0.4)
    expect(restored.robotMinDensity).toBe(0.4)
    expect(restored.robotDensityScale).toBe(2)
  })

  it("une ancienne sauvegarde sans robotMinDensity se charge avec le défaut", () => {
    saveActiveGame(createInfiniteGame(7), CAMERA)
    const snapshot = loadActiveGame("infinite")
    delete snapshot.robotMinDensity

    const restored = restoreInfiniteGame(snapshot)

    expect(restored.robotMinDensity).toBe(createInfiniteGame(7).robotMinDensity)
    expect(restored.revealedCount).toBe(snapshot.revealedCount)
  })
})

describe("gameStorage — cases compactées", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("une partie Infini jouée est restaurée case par case", () => {
    const game = createInfiniteGame(7)
    toggleFlag(game, getCell(game, 3, 3))
    revealCell(game, getCell(game, -6, 4))

    saveActiveGame(game, CAMERA)
    const snapshot = loadActiveGame("infinite")
    const restored = restoreInfiniteGame(snapshot)

    expect(Array.isArray(snapshot.cells)).toBe(false)
    expect(restored.revealedCount).toBe(game.revealedCount)
    expect(restored.flaggedCount).toBe(game.flaggedCount)
    for (const [key, cell] of game.cells) {
      if (cell.revealed || cell.flagged) {
        const back = restored.cells.get(key)
        expect([back.revealed, back.flagged]).toEqual([
          cell.revealed,
          cell.flagged,
        ])
      }
    }
  })

  it("quota plein : l'ancienne sauvegarde reste et le joueur est prévenu", () => {
    resetWriteWarning()
    currentToast.value = null
    const game = createInfiniteGame(7)
    saveActiveGame(game, CAMERA)
    const before = localStorage.getItem(
      "hibol-minesweeper:active-game:infinite",
    )
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError")
    })

    saveActiveGame(game, CAMERA)

    expect(localStorage.getItem("hibol-minesweeper:active-game:infinite")).toBe(
      before,
    )
    expect(currentToast.value.text).toMatch(/Storage full/)
  })
})
