import { describe, it, expect, vi } from "vitest"
import {
  DANGER_SAMPLE_STEPS,
  averageOverViewport,
  maxOverViewport,
} from "./viewportSampling"

describe("viewportSampling", () => {
  it("échantillonne le centre de chaque cellule de la grille, colonne par colonne", () => {
    const sampleAt = vi.fn(() => 0)

    averageOverViewport({ left: 0, top: 0, width: 10, height: 4 }, sampleAt, 2)

    expect(sampleAt.mock.calls).toEqual([
      [2.5, 1],
      [2.5, 3],
      [7.5, 1],
      [7.5, 3],
    ])
  })

  it("décale la grille avec l'origine et l'étend avec la taille du viewport", () => {
    const sampleAt = vi.fn(() => 0)

    maxOverViewport({ left: -20, top: 100, width: 40, height: 20 }, sampleAt, 2)

    expect(sampleAt.mock.calls).toEqual([
      [-10, 105],
      [-10, 115],
      [10, 105],
      [10, 115],
    ])
  })

  it("utilise une grille de DANGER_SAMPLE_STEPS² points par défaut", () => {
    const sampleAt = vi.fn(() => 0)
    const view = { left: 0, top: 0, width: 1, height: 1 }

    averageOverViewport(view, sampleAt)
    maxOverViewport(view, sampleAt)

    expect(sampleAt).toHaveBeenCalledTimes(2 * DANGER_SAMPLE_STEPS ** 2)
  })

  it("averageOverViewport fait la moyenne des échantillons", () => {
    // x aux centres : 11, 13, 15, 17, 19.
    const view = { left: 10, top: 0, width: 10, height: 10 }

    expect(averageOverViewport(view, (x) => x)).toBeCloseTo(15)
    expect(averageOverViewport(view, () => 0.4)).toBeCloseTo(0.4)
  })

  it("maxOverViewport garde le plus grand échantillon, sans dilution", () => {
    const view = { left: 0, top: 0, width: 10, height: 10 }

    // Un seul point sur 25 est chaud : la moyenne le dilue, le max non.
    const hot = (x, y) => (x === 5 && y === 5 ? 0.9 : 0)

    expect(maxOverViewport(view, hot)).toBe(0.9)
    expect(averageOverViewport(view, hot)).toBeCloseTo(0.9 / 25)
  })

  it("maxOverViewport vaut 0 au minimum", () => {
    const view = { left: 0, top: 0, width: 10, height: 10 }

    expect(maxOverViewport(view, () => -1)).toBe(0)
  })
})
