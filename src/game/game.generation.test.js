import { describe, it, expect } from 'vitest'
import {
  createGame,
  createInfiniteGame,
  createInfiniteCell,
  getCell,
  getDangerLevel,
  getMineDensity,
  getHotspotProximity,
  hotspotDebugAt,
  DEFAULT_DENSITY_SCALE,
  DEFAULT_DARKNESS_MINE_THRESHOLD,
} from './game.js'

// Toute la génération infini/trésor est déterministe (hash de seed). Ces
// tests lisent le plateau généré — aucun mock. Ils couvrent surtout des
// BRANCHES : garde `!isInfiniteLike`, plafonds de densité, exclusivité
// mine/cœur/robot, coupures dures, flux de hash séparés.

// MAX_DENSITY (plafond de densité ambiante) n'est pas exporté ; sa valeur est
// 0.25 (cf. game.js). L'effet hotspot peut pousser au-delà, jusqu'à ~0.6, et
// un plafond dur à 0.95 borne le tout.
const MAX_DENSITY = 0.25

// Un jeu infini réutilisé par plusieurs tests + le point le plus « au cœur »
// d'un hotspot trouvé par balayage déterministe.
const game = createInfiniteGame(1)

function findHotspotCenter() {
  let best = null
  for (let y = -300; y <= 300; y += 2) {
    for (let x = -300; x <= 300; x += 2) {
      const dbg = hotspotDebugAt(game, x, y)
      if (dbg && (best === null || dbg.ratio < best.ratio)) {
        best = { x, y, ...dbg }
        if (dbg.ratio < 0.1) return best
      }
    }
  }
  return best
}

const hotspot = findHotspotCenter()

describe('génération — garde hors modes infinite-like', () => {
  it('getDangerLevel / getMineDensity / getHotspotProximity valent 0 en classic', () => {
    const classic = createGame(5, 5, 3)
    expect(getDangerLevel(classic, 2, 2)).toBe(0)
    expect(getMineDensity(classic, 2, 2)).toBe(0)
    expect(getHotspotProximity(classic, 2, 2)).toBe(0)
  })
})

describe('génération — getDangerLevel', () => {
  it('reste dans [0, 1] partout et part bas à l’origine', () => {
    for (let y = -400; y <= 400; y += 40) {
      for (let x = -400; x <= 400; x += 40) {
        const level = getDangerLevel(game, x, y)
        expect(level).toBeGreaterThanOrEqual(0)
        expect(level).toBeLessThanOrEqual(1)
      }
    }
    // À l'origine on est à la densité de base (± jitter) : loin du plafond.
    expect(getDangerLevel(game, 0, 0)).toBeLessThan(0.5)
  })

  it('monte vers 1 avec la distance (moyenne proche << moyenne lointaine)', () => {
    const mean = (pts) => pts.reduce((s, [x, y]) => s + getDangerLevel(game, x, y), 0) / pts.length

    const near = []
    const far = []
    for (let a = 0; a < 24; a++) {
      const t = (a / 24) * Math.PI * 2
      near.push([Math.round(Math.cos(t) * 3), Math.round(Math.sin(t) * 3)])
      far.push([Math.round(Math.cos(t) * 450), Math.round(Math.sin(t) * 450)])
    }

    expect(mean(near)).toBeLessThan(0.4)
    expect(mean(far)).toBeGreaterThan(0.9)
  })
})

describe('génération — getMineDensity', () => {
  it('à l’origine : densité de base ± jitter, sous le plafond ambiant', () => {
    const d = getMineDensity(game, 0, 0)
    expect(d).toBeGreaterThan(0.1) // base 0.15 − jitter 0.045
    expect(d).toBeLessThanOrEqual(MAX_DENSITY + 1e-9)
  })

  it('loin d’un hotspot : ≤ plafond ambiant ; jamais au-dessus du plafond dur 0.95', () => {
    for (let y = -260; y <= 260; y += 7) {
      for (let x = -260; x <= 260; x += 7) {
        const d = getMineDensity(game, x, y)
        expect(d).toBeLessThanOrEqual(0.95)

        const dbg = hotspotDebugAt(game, x, y)
        const nearHotspot = dbg && dbg.ratio < 1
        if (!nearHotspot) {
          expect(d).toBeLessThanOrEqual(MAX_DENSITY + 1e-9)
        }
      }
    }
  })

  it('hotspotBoost pousse la densité au-dessus du plafond ambiant', () => {
    expect(hotspot, 'aucun hotspot trouvé dans la zone balayée').toBeTruthy()
    const d = getMineDensity(game, hotspot.x, hotspot.y)
    expect(d).toBeGreaterThan(MAX_DENSITY)
    expect(d).toBeLessThan(0.95)
  })
})

describe('génération — getHotspotProximity / hotspotDebugAt', () => {
  it('0 loin de tout hotspot (zone d’origine), > 0.5 au cœur d’un hotspot', () => {
    expect(getHotspotProximity(game, 3, 3)).toBe(0)

    expect(hotspot).toBeTruthy()
    expect(getHotspotProximity(game, hotspot.x, hotspot.y)).toBeGreaterThan(0.5)
  })

  it('monte à mesure qu’on approche du cœur', () => {
    const atCenter = getHotspotProximity(game, hotspot.x, hotspot.y)
    const farther = getHotspotProximity(game, hotspot.x + 14, hotspot.y + 14)
    expect(atCenter).toBeGreaterThanOrEqual(farther)
  })

  it('hotspotDebugAt renvoie une clé stable de zone', () => {
    const a = hotspotDebugAt(game, hotspot.x, hotspot.y)
    const b = hotspotDebugAt(game, hotspot.x + 2, hotspot.y)
    expect(a.key).toMatch(/^-?\d+,-?\d+$/)
    expect(b.key).toBe(a.key) // deux points au cœur de la même zone
    expect(a.ratio).toBeLessThan(1) // bien à l'intérieur
    // Près de l'origine : hotspotDebugAt peut pointer la zone la plus proche,
    // mais son ratio est franchement > 1 (on n'est dans aucune zone).
    const origin = hotspotDebugAt(game, 3, 3)
    if (origin) expect(origin.ratio).toBeGreaterThan(1)
  })
})

describe('génération — createInfiniteCell : exclusivité mine > cœur > robot', () => {
  it('jamais deux drapeaux à la fois, et rien sur une mine', () => {
    const g = createInfiniteGame(1)
    g.openingInProgress = false

    for (let y = 95; y <= 140; y++) {
      for (let x = 95; x <= 140; x++) {
        const cell = createInfiniteCell(g, x, y)
        const flags = [cell.isMine, cell.isHeart, cell.isRobot].filter(Boolean)
        expect(flags.length, `(${x},${y})`).toBeLessThanOrEqual(1)
        if (cell.isHeart || cell.isRobot) {
          expect(cell.isMine).toBe(false)
        }
      }
    }
  })

  it('rien pendant openingInProgress', () => {
    const g = createInfiniteGame(1)
    g.openingInProgress = true

    for (let y = 95; y <= 140; y++) {
      for (let x = 95; x <= 140; x++) {
        const cell = createInfiniteCell(g, x, y)
        expect(cell.isHeart).toBe(false)
        expect(cell.isRobot).toBe(false)
      }
    }
  })
})

describe('génération — coupures dures de densité locale', () => {
  it('heartMinDensity = 1 ⇒ aucun cœur ; robotMinDensity = 1 ⇒ aucun robot', () => {
    const g = createInfiniteGame(1)
    g.openingInProgress = false
    g.heartMinDensity = 1
    g.robotMinDensity = 1

    for (let y = 60; y <= 220; y += 3) {
      for (let x = 60; x <= 220; x += 3) {
        const cell = createInfiniteCell(g, x, y)
        expect(cell.isHeart).toBe(false)
        expect(cell.isRobot).toBe(false)
      }
    }
  })
})

describe('génération — knobs de densité', () => {
  const scan = (g, has) => {
    g.openingInProgress = false
    for (let y = 100; y <= 180; y++) {
      for (let x = 100; x <= 180; x++) {
        if (has(createInfiniteCell(g, x, y))) return true
      }
    }
    return false
  }

  it('heartDensityScale = 0 ⇒ aucun cœur ; un scale élevé en fait apparaître (même seed)', () => {
    expect(scan(createInfiniteGame(1, 0.15, 0), (c) => c.isHeart)).toBe(false)

    const boosted = createInfiniteGame(1)
    boosted.heartDensityScale = 80
    expect(scan(boosted, (c) => c.isHeart)).toBe(true)
  })

  it('robotDensityScale = 0 ⇒ aucun robot ; un scale élevé en fait apparaître', () => {
    const off = createInfiniteGame(1, 0.15, 1, 0.23, DEFAULT_DENSITY_SCALE, DEFAULT_DARKNESS_MINE_THRESHOLD, 0)
    expect(scan(off, (c) => c.isRobot)).toBe(false)

    const boosted = createInfiniteGame(1)
    boosted.robotDensityScale = 80
    expect(scan(boosted, (c) => c.isRobot)).toBe(true)
  })
})

describe('génération — flux de hash séparés (cœurs/robots ne corrèlent pas avec les mines)', () => {
  it('changer heartDensityScale / robotDensityScale ne bouge aucune mine', () => {
    const base = createInfiniteGame(7)
    const noHearts = createInfiniteGame(7, 0.15, 0)
    const noRobots = createInfiniteGame(7, 0.15, 1, 0.23, DEFAULT_DENSITY_SCALE, DEFAULT_DARKNESS_MINE_THRESHOLD, 0)

    expect(noHearts.seed).toBe(base.seed)
    expect(noRobots.seed).toBe(base.seed)

    for (let y = -12; y <= 12; y++) {
      for (let x = -12; x <= 12; x++) {
        const mine = createInfiniteCell(base, x, y).isMine
        expect(createInfiniteCell(noHearts, x, y).isMine, `hearts @ (${x},${y})`).toBe(mine)
        expect(createInfiniteCell(noRobots, x, y).isMine, `robots @ (${x},${y})`).toBe(mine)
      }
    }
  })
})
