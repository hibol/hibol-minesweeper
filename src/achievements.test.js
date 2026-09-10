// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest'

// achievements.js : `unlockedAchievements` + compteurs (`legacyLosses`,
// `treasureDaysPlayed`) initialisés depuis localStorage à l'import. resetModules
// + import() dynamique par test pour contrôler ces états de départ.

const UNLOCKED_KEY = 'hibol-minesweeper:achievements-unlocked'
const LEGACY_LOSSES_KEY = 'hibol-minesweeper:legacy-losses'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('achievements — unlockAchievement', () => {
  it('est idempotent et ignore un id inconnu', async () => {
    const { unlockAchievement, unlockedAchievements } = await import('./achievements.js')

    unlockAchievement('traveler')
    const stamp = unlockedAchievements.value.traveler
    expect(stamp).toBeTruthy()

    unlockAchievement('traveler') // 2e fois : ne réécrit pas le timestamp
    expect(unlockedAchievements.value.traveler).toBe(stamp)

    unlockAchievement('not-a-real-id') // no-op
    expect(unlockedAchievements.value['not-a-real-id']).toBeUndefined()
  })
})

describe('achievements — file de bannières (hold / resume)', () => {
  it('hold remet la bannière courante en tête, resume la ressort', async () => {
    const {
      unlockAchievement,
      currentAchievementBanner,
      holdAchievementBanners,
      resumeAchievementBanners,
    } = await import('./achievements.js')

    unlockAchievement('traveler')
    expect(currentAchievementBanner.value?.id).toBe('traveler')

    holdAchievementBanners()
    expect(currentAchievementBanner.value).toBeNull()

    // Un autre achievement se débloque pendant le hold : il attend en file.
    unlockAchievement('hearty')
    expect(currentAchievementBanner.value).toBeNull()

    resumeAchievementBanners()
    expect(currentAchievementBanner.value?.id).toBe('traveler') // remis en tête

    // La file continue de se vider normalement.
    const { dismissAchievementBanner } = await import('./achievements.js')
    dismissAchievementBanner()
    expect(currentAchievementBanner.value?.id).toBe('hearty')
    dismissAchievementBanner()
    expect(currentAchievementBanner.value).toBeNull()
  })
})

describe('achievements — compteurs cumulatifs', () => {
  it('recordLegacyLoss débloque "noob" à 100', async () => {
    localStorage.setItem(LEGACY_LOSSES_KEY, '99')
    const { recordLegacyLoss, unlockedAchievements } = await import('./achievements.js')

    recordLegacyLoss() // 99 → 100
    expect(unlockedAchievements.value.noob).toBeTruthy()
  })

  it('recordLegacyLoss ne débloque pas "noob" sous le seuil', async () => {
    localStorage.setItem(LEGACY_LOSSES_KEY, '10')
    const { recordLegacyLoss, unlockedAchievements } = await import('./achievements.js')

    recordLegacyLoss()
    expect(unlockedAchievements.value.noob).toBeUndefined()
  })

  it('checkHoarder débloque "hoarder" à 10, pas en dessous', async () => {
    const { checkHoarder, unlockedAchievements } = await import('./achievements.js')

    checkHoarder(9)
    expect(unlockedAchievements.value.hoarder).toBeUndefined()

    checkHoarder(10)
    expect(unlockedAchievements.value.hoarder).toBeTruthy()
  })

  it('recordTreasureDayPlayed débloque "creature-of-habit" à 7', async () => {
    localStorage.setItem('hibol-minesweeper:treasure-days-played', '6')
    const { recordTreasureDayPlayed, unlockedAchievements } = await import('./achievements.js')

    recordTreasureDayPlayed()
    expect(unlockedAchievements.value['creature-of-habit']).toBeTruthy()
  })
})
