// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest'
import { recordRun, loadTopRuns } from './runHistory.js'

// runHistory.js ne lit localStorage qu'à l'appel (pas à l'import) — un simple
// clear() par test suffit.
const KEY = 'hibol-minesweeper:infinite-top-runs'

beforeEach(() => {
  localStorage.clear()
})

describe('runHistory — recordRun', () => {
  it('trie par revealedCount décroissant et renvoie le rang 1-indexé', () => {
    expect(recordRun({ revealedCount: 100 }).rank).toBe(1)
    expect(recordRun({ revealedCount: 500 }).rank).toBe(1) // meilleur → 1er
    const third = recordRun({ revealedCount: 50 })

    expect(third.rank).toBe(3)
    expect(third.runs.map((r) => r.revealedCount)).toEqual([500, 100, 50])
  })

  it('persiste la liste triée', () => {
    recordRun({ revealedCount: 10 })
    recordRun({ revealedCount: 30 })
    recordRun({ revealedCount: 20 })

    expect(loadTopRuns().map((r) => r.revealedCount)).toEqual([30, 20, 10])
  })

  it('plafonne à MAX_RUNS (10) et renvoie null pour une run hors top', () => {
    for (let i = 1; i <= 10; i++) {
      recordRun({ revealedCount: i * 100 }) // 100..1000
    }
    expect(loadTopRuns()).toHaveLength(10)

    const outside = recordRun({ revealedCount: 5 }) // sous le 10e (100)
    expect(outside.rank).toBeNull()
    expect(loadTopRuns()).toHaveLength(10)
    expect(loadTopRuns().some((r) => r.revealedCount === 5)).toBe(false)
  })
})
