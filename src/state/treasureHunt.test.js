// @vitest-environment jsdom

import { describe, it, expect } from "vitest"
import { treasureDaySeed } from "./treasureHunt"

describe("treasureDaySeed", () => {
  it("est la même pour tous les joueurs d'un même jour", () => {
    expect(treasureDaySeed(new Date(2026, 9, 13, 8))).toBe(
      treasureDaySeed(new Date(2026, 9, 13, 23, 59)),
    )
  })

  it("donne une seed différente chaque jour, sans seeds voisines", () => {
    const seeds = []
    for (let d = 0; d < 730; d++) {
      seeds.push(treasureDaySeed(new Date(2026, 0, 1 + d)))
    }
    expect(new Set(seeds).size).toBe(seeds.length)
    // Les flux dérivés vont jusqu'à seed + 10 (cf. game.js) : aucun
    // recouvrement possible entre deux jours.
    const sorted = [...seeds].sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i] - sorted[i - 1]).toBeGreaterThan(10)
    }
  })
})
