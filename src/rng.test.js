import { describe, it, expect } from "vitest"
import { hashSeed } from "./rng.js"

describe("hashSeed", () => {
  it("est déterministe et dépend de l'ordre des entrées", () => {
    expect(hashSeed(20261013)).toBe(hashSeed(20261013))
    expect(hashSeed(1, 2)).not.toBe(hashSeed(2, 1))
  })

  it("rend un entier 31 bits positif", () => {
    for (let n = 0; n < 1000; n++) {
      const h = hashSeed(20261000 + n, n)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(2 ** 31)
    }
  })

  it("disperse des entrées consécutives (aucune sortie voisine ni répétée)", () => {
    const outputs = []
    for (let n = 0; n < 1000; n++) outputs.push(hashSeed(20261000 + n))
    expect(new Set(outputs).size).toBe(outputs.length)
    // Pas de « seed + 1 » : les flux dérivés (seed + 1..10) de deux jours ne
    // doivent jamais se recouvrir.
    const sorted = [...outputs].sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i] - sorted[i - 1]).toBeGreaterThan(10)
    }
  })
})
