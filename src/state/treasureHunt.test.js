// @vitest-environment jsdom

import { describe, it, expect } from "vitest"
import {
  purgeOldTreasureDays,
  treasureDayKey,
  treasureDaySeed,
} from "./treasureHunt"

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

describe("purgeOldTreasureDays", () => {
  const slot = (dayKey) => `hibol-minesweeper:treasure-hunt:${dayKey}`
  const today = treasureDayKey()
  const yesterday = treasureDayKey(new Date(Date.now() - 36 * 3600 * 1000))

  function put(dayKey, snap) {
    localStorage.setItem(slot(dayKey), JSON.stringify(snap))
  }

  it("garde le jour courant et signale une chasse entamée laissée en plan", () => {
    localStorage.clear()
    put(today, { status: "playing", engaged: true })
    put(yesterday, { status: "playing", engaged: true })

    expect(purgeOldTreasureDays()).toBe(true)
    expect(localStorage.getItem(slot(yesterday))).toBeNull()
    expect(localStorage.getItem(slot(today))).not.toBeNull()
  })

  it("ne signale ni une chasse terminée, ni une chasse jamais entamée, ni un stockage illisible", () => {
    localStorage.clear()
    put("20200101", { status: "won", engaged: true })
    put("20200102", { status: "playing", engaged: false })
    localStorage.setItem(slot("20200103"), "{pas du json")

    expect(purgeOldTreasureDays()).toBe(false)
    expect(localStorage.getItem(slot("20200101"))).toBeNull()
    expect(localStorage.getItem(slot("20200103"))).toBeNull()
  })
})
