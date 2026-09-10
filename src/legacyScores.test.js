// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest'

// legacyScores.js charge sa table depuis localStorage à l'import
// (`ref(loadBoard())`), avec un sanitizeList interne (filtre non-fini, tri
// croissant, cap 10). On teste sanitizeList à travers l'état initial, et
// recordLegacyWin sur des modules fraîchement importés.

const KEY = 'hibol-minesweeper:legacy-best-times'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('legacyScores — sanitizeList (via l’état chargé)', () => {
  it('filtre les timeMs non finis, trie croissant, cape à 10', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        beginner: [
          { timeMs: 5000 },
          { timeMs: 1000 },
          { timeMs: Number.NaN }, // → null après JSON → filtré
          { timeMs: 'nope' }, // → filtré
          null, // → filtré
          { timeMs: 3000 },
          { timeMs: 2000 },
        ],
      }),
    )

    const { legacyScores } = await import('./legacyScores.js')

    expect(legacyScores.value.beginner.map((e) => e.timeMs)).toEqual([1000, 2000, 3000, 5000])
    expect(legacyScores.value.intermediate).toEqual([])
  })

  it('cape à 10 entrées', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ expert: Array.from({ length: 13 }, (_, i) => ({ timeMs: (13 - i) * 100 })) }),
    )

    const { legacyScores } = await import('./legacyScores.js')

    expect(legacyScores.value.expert).toHaveLength(10)
    expect(legacyScores.value.expert[0].timeMs).toBe(100) // le plus rapide en tête
  })
})

describe('legacyScores — recordLegacyWin', () => {
  it('renvoie le rang 1-indexé quand le temps entre au top', async () => {
    const { recordLegacyWin } = await import('./legacyScores.js')

    expect(recordLegacyWin('beginner', 5000).rank).toBe(1) // table vide
    expect(recordLegacyWin('beginner', 3000).rank).toBe(1) // plus rapide → 1er
    expect(recordLegacyWin('beginner', 9000).rank).toBe(3) // dernier des trois
  })

  it('renvoie rank null si le temps ne rentre pas dans le top 10', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ beginner: Array.from({ length: 10 }, (_, i) => ({ timeMs: (i + 1) * 100 })) }),
    )
    const { recordLegacyWin } = await import('./legacyScores.js')

    expect(recordLegacyWin('beginner', 999999).rank).toBeNull()
  })

  it('difficulté invalide ou temps non fini ⇒ { rank: null }', async () => {
    const { recordLegacyWin } = await import('./legacyScores.js')

    expect(recordLegacyWin('bogus', 1000)).toEqual({ rank: null })
    expect(recordLegacyWin('beginner', Number.NaN)).toEqual({ rank: null })
  })
})
