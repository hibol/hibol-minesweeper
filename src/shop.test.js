// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest'

// shop.js lit son inventaire depuis localStorage à l'import et importe
// statiquement treasureHunt (solde `chestReward`, lu de localStorage) +
// achievements (file de bannières). resetModules + import() dynamique ⇒ tout
// le graphe est reconstruit ensemble, donc les singletons partagés restent
// cohérents entre shop / treasureHunt / achievements.

const REWARD_KEY = 'hibol-minesweeper:chest-reward'
const INVENTORY_KEY = 'hibol-minesweeper:shop-inventory'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

async function loadShop(reward, inventory) {
  if (reward != null) localStorage.setItem(REWARD_KEY, String(reward))
  if (inventory) localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventory))
  const shop = await import('./shop.js')
  const achievements = await import('./achievements.js')
  return { ...shop, achievements }
}

describe('shop — buy : solde', () => {
  it('refuse si le solde est insuffisant', async () => {
    const { buy, inventory } = await loadShop(0)

    expect(buy('windMachine')).toBe(false)
    expect(inventory.value.windMachine).toBe(0)
  })
})

describe('shop — buy : one-shot', () => {
  it('un item "mode" déjà possédé n’est pas rachetable', async () => {
    const { buy } = await loadShop(100, { legacyMode: 1 })
    expect(buy('legacyMode')).toBe(false)
  })

  it('un cosmétique déjà possédé n’est pas rachetable, et débloque "fashionista"', async () => {
    const { buy, achievements } = await loadShop(100)

    expect(buy('mineDynamite')).toBe(true)
    expect(achievements.unlockedAchievements.value.fashionista).toBeTruthy()
    expect(buy('mineDynamite')).toBe(false) // déjà possédé
  })
})

describe('shop — buy : achievements machines', () => {
  it('acheter une machine débloque "machine-lover" ; les 3 ⇒ "fully-equipped"', async () => {
    const { buy, achievements } = await loadShop(100)

    expect(buy('windMachine')).toBe(true)
    expect(achievements.unlockedAchievements.value['machine-lover']).toBeTruthy()
    expect(achievements.unlockedAchievements.value['fully-equipped']).toBeFalsy()

    buy('travelMachine')
    buy('xrayMachine')
    expect(achievements.unlockedAchievements.value['fully-equipped']).toBeTruthy()
  })
})

describe('shop — consume', () => {
  it('refuse quand l’inventaire est à 0, sinon décrémente', async () => {
    const { buy, consume, inventory } = await loadShop(100)

    expect(consume('windMachine')).toBe(false) // on n'en a aucune

    buy('windMachine')
    expect(consume('windMachine')).toBe(true)
    expect(inventory.value.windMachine).toBe(0)
    expect(consume('windMachine')).toBe(false)
  })
})

describe('shop — legacyUnlocked', () => {
  it('reflète la présence de legacyMode dans l’inventaire', async () => {
    const owned = await loadShop(100, { legacyMode: 1 })
    expect(owned.legacyUnlocked.value).toBe(true)

    vi.resetModules()
    localStorage.clear()
    const notOwned = await loadShop(100)
    expect(notOwned.legacyUnlocked.value).toBe(false)
  })
})
