import { describe, it, expect } from "vitest"
import { encodeCells, decodeCells } from "./cellCodec.js"

const cell = (x, y, over = {}) => ({
  x,
  y,
  revealed: false,
  flagged: false,
  wrong: false,
  tiltDeg: 0,
  heartFogConfirmed: false,
  ...over,
})

// Ordre indifférent : on compare des ensembles de cases.
const byPosition = (a, b) => a.x - b.x || a.y - b.y
const sorted = (cells) => [...cells].sort(byPosition)

describe("cellCodec", () => {
  it("liste vide : aller-retour vide", () => {
    expect(decodeCells(encodeCells([]))).toEqual([])
  })

  it("révélées, marquées, wrong et cœurs confirmés font l'aller-retour", () => {
    const cells = [
      cell(0, 0, { revealed: true }),
      cell(1, 0, { flagged: true }),
      cell(2, 0, { revealed: true, heartFogConfirmed: true }),
      cell(3, 0, { flagged: true, wrong: true }),
    ]

    expect(sorted(decodeCells(encodeCells(cells)))).toEqual(sorted(cells))
  })

  it("coordonnées négatives et frontières de blocs", () => {
    const cells = [
      cell(-1, -1, { revealed: true }),
      cell(-32, -33, { flagged: true }),
      cell(31, 31, { revealed: true }),
      cell(32, 32, { revealed: true }),
      cell(-1000, 4321, { revealed: true }),
    ]

    expect(sorted(decodeCells(encodeCells(cells)))).toEqual(sorted(cells))
  })

  it("case seulement inclinée (ni révélée ni marquée) conservée", () => {
    const cells = [cell(5, -7, { tiltDeg: -8.3 })]

    expect(decodeCells(encodeCells(cells))).toEqual(cells)
  })

  it("l'inclinaison est arrondie au dixième de degré", () => {
    const [decoded] = decodeCells(
      encodeCells([cell(0, 0, { revealed: true, tiltDeg: 7.3685729 })]),
    )

    expect(decoded.tiltDeg).toBe(7.4)
  })

  it("l'ancien format (tableau d'objets) est renvoyé tel quel", () => {
    const legacy = [cell(0, 0, { revealed: true })]

    expect(decodeCells(legacy)).toBe(legacy)
  })

  it("un format inconnu est refusé", () => {
    expect(() => decodeCells({ format: 99, maps: {}, extras: [] })).toThrow()
    expect(() => decodeCells(null)).toThrow()
  })

  it("aller-retour sur un grand terrain aléatoire, bien plus petit que le JSON", () => {
    let seed = 12345
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    const cells = []
    for (let y = -60; y < 60; y++) {
      for (let x = -80; x < 80; x++) {
        const r = random()
        if (r < 0.7) {
          cells.push(
            cell(x, y, {
              revealed: r < 0.5,
              flagged: r >= 0.5,
              tiltDeg: random() < 0.05 ? Math.round(random() * 100) / 10 : 0,
              heartFogConfirmed: random() < 0.01,
            }),
          )
        }
      }
    }

    const encoded = encodeCells(cells)

    expect(sorted(decodeCells(encoded))).toEqual(sorted(cells))
    expect(JSON.stringify(encoded).length).toBeLessThan(
      JSON.stringify(cells).length / 8,
    )
  })
})
