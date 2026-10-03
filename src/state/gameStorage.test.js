// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from "vitest"
import { saveActiveGame, loadActiveGame } from "./gameStorage.js"
import { createInfiniteGame, restoreInfiniteGame } from "../game/game.js"

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
