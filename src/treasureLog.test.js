// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// treasureLog.js lit localStorage à l'import (`const state = load()`) et expose
// des singletons réactifs. Pour repartir d'un état propre par test :
// localStorage.clear() + vi.resetModules() + import() dynamique.
//
// Fake timers : `checkStreakGap` lit `treasureDayKey()` = `new Date()`, et
// `previousDayKey` construit des Date — on fige l'horloge pour un "aujourd'hui"
// stable.

const LOG_KEY = 'hibol-minesweeper:treasure-log'

function entry(dayKey, outcome = 'won') {
  return { dayKey, seed: Number(dayKey), outcome, minesHit: 0, timeMs: 1000, reward: 3, tornadoes: 0, maxDistance: 60 }
}

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-15T12:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('treasureLog — recordTreasureDay : streak', () => {
  it('jour consécutif gagné ⇒ currentStreak++', async () => {
    const { recordTreasureDay, currentStreak } = await import('./treasureLog.js')

    recordTreasureDay(entry('20260613'))
    expect(currentStreak.value).toBe(1) // premier jour résolu

    recordTreasureDay(entry('20260614')) // veille de 20260614 = 20260613 → +1
    expect(currentStreak.value).toBe(2)

    recordTreasureDay(entry('20260615'))
    expect(currentStreak.value).toBe(3)
  })

  it('jour sauté (gagné) ⇒ streak repart à 1 ; défaite ⇒ 0 ; bestStreak = max', async () => {
    const { recordTreasureDay, currentStreak, bestStreak } = await import('./treasureLog.js')

    recordTreasureDay(entry('20260610'))
    recordTreasureDay(entry('20260611'))
    expect(currentStreak.value).toBe(2)
    expect(bestStreak.value).toBe(2)

    // Trou : 20260611 → 20260614 (on a sauté deux jours). Toujours une
    // victoire → recordTreasureDay remet à 1 (le "0" d'un trou vient de
    // checkStreakGap, cf. test suivant).
    recordTreasureDay(entry('20260614'))
    expect(currentStreak.value).toBe(1)
    expect(bestStreak.value).toBe(2) // conservé

    // Défaite ⇒ 0.
    recordTreasureDay(entry('20260615', 'lost'))
    expect(currentStreak.value).toBe(0)
    expect(bestStreak.value).toBe(2)
  })

  it('plafonne le log à 60 entrées', async () => {
    const { recordTreasureDay, treasureEntries } = await import('./treasureLog.js')

    for (let d = 1; d <= 65; d++) {
      recordTreasureDay(entry(`202605${String(d).padStart(2, '0')}`))
    }

    expect(treasureEntries.value).toHaveLength(60)
    // newest first
    expect(treasureEntries.value[0].dayKey).toBe('20260565')
  })

  it('persiste dans localStorage', async () => {
    const { recordTreasureDay } = await import('./treasureLog.js')
    recordTreasureDay(entry('20260615'))

    const stored = JSON.parse(localStorage.getItem(LOG_KEY))
    expect(stored.currentStreak).toBe(1)
    expect(stored.lastResolvedDayKey).toBe('20260615')
    expect(stored.entries).toHaveLength(1)
  })
})

describe('treasureLog — checkStreakGap au boot', () => {
  it('casse le streak si le dernier jour résolu n’est ni aujourd’hui ni hier', async () => {
    // Amorce un état où le dernier jour résolu est vieux de 6 jours.
    localStorage.setItem(
      LOG_KEY,
      JSON.stringify({ entries: [], currentStreak: 4, bestStreak: 4, lastResolvedDayKey: '20260609' }),
    )
    const { checkStreakGap, currentStreak } = await import('./treasureLog.js')

    checkStreakGap() // "aujourd'hui" = 2026-06-15
    expect(currentStreak.value).toBe(0)
  })

  it('ne touche pas le streak si le dernier jour résolu est hier', async () => {
    localStorage.setItem(
      LOG_KEY,
      JSON.stringify({ entries: [], currentStreak: 4, bestStreak: 4, lastResolvedDayKey: '20260614' }),
    )
    const { checkStreakGap, currentStreak } = await import('./treasureLog.js')

    checkStreakGap()
    expect(currentStreak.value).toBe(4)
  })
})
