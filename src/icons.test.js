// @vitest-environment jsdom
// achievements.js lit localStorage à l'import.
import { describe, it, expect } from "vitest"
import * as icons from "./icons"
import { ACHIEVEMENTS } from "./state/achievements"

describe("icons", () => {
  it("RULER_PIXELS (qui dessinait une boussole) est renommé COMPASS_PIXELS", () => {
    expect(icons.RULER_PIXELS).toBeUndefined()
    expect(icons.COMPASS_PIXELS).toBeDefined()
    expect(ACHIEVEMENTS.some((a) => a.pixels === icons.COMPASS_PIXELS)).toBe(
      true,
    )
  })

  it("aucun succès ne pointe vers un sprite inexistant", () => {
    for (const achievement of ACHIEVEMENTS) {
      expect(achievement.pixels, achievement.id).toBeDefined()
    }
  })

  it("CELL_PIXELS et DISTANCE_PIXELS sont des grilles 9×9", () => {
    for (const pixels of [icons.CELL_PIXELS, icons.DISTANCE_PIXELS]) {
      expect(pixels.width).toBe(9)
      expect(pixels.height).toBe(9)
      expect(pixels.every((p) => p.color.startsWith("var(--"))).toBe(true)
    }
  })
})
