import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useCompass } from './useCompass.js'

// useCompass prend les refs d'App.vue (game + caméra) et dérive cap + warmth
// depuis le CENTRE du viewport. Ici on passe des ref() nues.

function setup(gameState, cam = {}) {
  const game = ref(gameState)
  const originX = ref(cam.originX ?? 0)
  const originY = ref(cam.originY ?? 0)
  const viewportWidth = ref(cam.viewportWidth ?? 0)
  const viewportHeight = ref(cam.viewportHeight ?? 0)
  return {
    ...useCompass(game, originX, originY, viewportWidth, viewportHeight),
    game,
  }
}

const playing = (chest, extra = {}) => ({
  mode: 'treasure',
  status: 'playing',
  chestFound: false,
  chest,
  ...extra,
})

describe('useCompass — angleDeg (0° = vers le haut, sens horaire)', () => {
  it('pointe le coffre relativement au centre du viewport', () => {
    expect(setup(playing({ x: 0, y: -10 })).angleDeg.value).toBeCloseTo(0) // au-dessus
    expect(setup(playing({ x: 10, y: 0 })).angleDeg.value).toBeCloseTo(90) // à droite
    expect(Math.abs(setup(playing({ x: 0, y: 10 })).angleDeg.value)).toBeCloseTo(180) // en dessous
    expect(setup(playing({ x: -10, y: 0 })).angleDeg.value).toBeCloseTo(-90) // à gauche
  })

  it('tient compte de l’origine et de la taille du viewport', () => {
    // Centre du viewport = (origin + taille/2) = (10, 10). Coffre en (10, 0)
    // → pile au-dessus du centre.
    const c = setup(playing({ x: 10, y: 0 }), {
      originX: 0,
      originY: 0,
      viewportWidth: 20,
      viewportHeight: 20,
    })
    expect(c.angleDeg.value).toBeCloseTo(0)
  })
})

describe('useCompass — warmth', () => {
  it('1 sur le coffre, 0 au-delà de COLD_DISTANCE, courbe concave entre les deux', () => {
    expect(setup(playing({ x: 0, y: 0 })).warmth.value).toBeCloseTo(1)
    expect(setup(playing({ x: 0, y: 200 })).warmth.value).toBe(0) // > 90

    // À mi-distance (45 sur 90), une courbe concave (racine) donne > 0.5.
    const mid = setup(playing({ x: 0, y: 45 })).warmth.value
    expect(mid).toBeGreaterThan(0.5)
    expect(mid).toBeLessThan(1)
  })
})

describe('useCompass — active', () => {
  it('faux hors mode trésor (et ne lit pas game.chest inexistant)', () => {
    const c = setup({ mode: 'infinite', status: 'playing', chestFound: false })
    expect(c.active.value).toBe(false)
    expect(c.warmth.value).toBe(0)
    // dx/dy court-circuités à 0 → pas de lecture de game.chest (inexistant ici),
    // et angleDeg reste un nombre fini (atan2(0, -0) = π, sans importance).
    expect(Number.isFinite(c.angleDeg.value)).toBe(true)
  })

  it('faux si la partie n’est pas en cours', () => {
    expect(setup({ mode: 'treasure', status: 'won', chestFound: true, chest: { x: 0, y: 10 } }).active.value).toBe(false)
  })

  it('faux une fois le coffre trouvé', () => {
    expect(setup(playing({ x: 0, y: 10 }, { chestFound: true })).active.value).toBe(false)
  })

  it('vrai en pleine chasse', () => {
    expect(setup(playing({ x: 0, y: 10 })).active.value).toBe(true)
  })
})
