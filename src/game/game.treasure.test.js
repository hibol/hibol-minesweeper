import { describe, it, expect } from 'vitest'
import {
  createTreasureGame,
  chestPositionFor,
  getCell,
  revealCell,
  treasureWinReward,
  CHEST_MIN_DISTANCE,
  CHEST_MAX_DISTANCE,
} from './game.js'

// Le mode trésor réutilise le moteur infini (cases générées à la volée,
// déterministes depuis la seed). Le coffre est loin (distance 50..100 de
// l'origine), donc hors de la poche d'ouverture : pour révéler une case
// là-bas via revealCell (qui refuse une case "trop loin", sans voisin
// révélé), on marque à la main `revealed = true` sur une case adjacente —
// on n'appelle jamais openCell dessus, donc aucune mécanique ne se
// déclenche par ce raccourci.

// Scanne une région autour de l'origine et renvoie la 1re case qui vérifie
// `predicate`. Déterministe (pas de RNG).
function findCell(game, radius, predicate) {
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      const cell = getCell(game, x, y)
      if (predicate(cell)) return cell
    }
  }
  return undefined
}

describe('trésor — chestPositionFor', () => {
  it('est déterministe et place le coffre à une distance euclidienne dans [50, 100]', () => {
    for (const seed of [1, 42, 1000]) {
      for (let k = 0; k <= 4; k++) {
        const a = chestPositionFor(seed, k)
        const b = chestPositionFor(seed, k)
        expect(a).toEqual(b)

        // La distance brute est dans [50, 100). x et y sont arrondis à
        // l'entier → le point bouge de ~0.7 par axe, d'où ~1.5 de marge.
        const distance = Math.hypot(a.x, a.y)
        expect(distance).toBeGreaterThanOrEqual(CHEST_MIN_DISTANCE - 1.5)
        expect(distance).toBeLessThanOrEqual(CHEST_MAX_DISTANCE + 1.5)
      }
    }
  })
})

describe('trésor — zone 3x3 forcée sans mine autour du coffre', () => {
  it('couvre toutes les positions du coffre, de k = 0 à tornadoCount', () => {
    const game = createTreasureGame(7)

    // k = 0 : la position du jour.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chest = game.chest
        expect(getCell(game, chest.x + dx, chest.y + dy).isMine).toBe(false)
      }
    }

    // Simule 2 relocalisations : isInChestSafeZone doit protéger le 3x3
    // autour de chestPositionFor(seed, k) pour k = 0, 1, 2.
    game.tornadoCount = 2
    for (let k = 0; k <= 2; k++) {
      const chest = chestPositionFor(game.seed, k)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          expect(
            getCell(game, chest.x + dx, chest.y + dy).isMine,
            `k=${k} @ (${dx},${dy})`,
          ).toBe(false)
        }
      }
    }
  })
})

describe('trésor — trouver le coffre', () => {
  it('révéler la case coffre → status "won" + chestFound', () => {
    const game = createTreasureGame(11)
    const chest = game.chest

    // Rend la case coffre atteignable (un voisin révélé suffit).
    getCell(game, chest.x + 1, chest.y).revealed = true
    revealCell(game, getCell(game, chest.x, chest.y))

    expect(game.status).toBe('won')
    expect(game.chestFound).toBe(true)
    expect(getCell(game, chest.x, chest.y).isChest).toBe(true)
  })

  it('coffre balayé par une cascade de cases à 0 voisin → status "won"', () => {
    // Le 3x3 autour du coffre est garanti sans mine, mais une case
    // adjacente au coffre n'est pas forcément à 0 voisin : on cherche une
    // seed où c'est le cas.
    let found
    for (let seed = 1; seed <= 800 && !found; seed++) {
      const game = createTreasureGame(seed)
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const neighbor = getCell(game, game.chest.x + dx, game.chest.y + dy)
        if (!neighbor.isMine && neighbor.neighborMines === 0) {
          found = { game, dx, dy }
          break
        }
      }
    }
    expect(found, 'aucune seed testée ne donne une case à 0 voisin collée au coffre').toBeTruthy()

    const { game, dx, dy } = found
    const chest = game.chest
    const launch = getCell(game, chest.x + dx, chest.y + dy)

    // Rend `launch` atteignable depuis le côté opposé au coffre.
    getCell(game, launch.x + dx, launch.y + dy).revealed = true
    revealCell(game, launch) // 0 voisin → cascade → balaye le coffre

    expect(game.status).toBe('won')
    expect(game.chestFound).toBe(true)
    expect(getCell(game, chest.x, chest.y).revealed).toBe(true)
    expect(getCell(game, chest.x, chest.y).isChest).toBe(true)
  })
})

describe('trésor — tornade', () => {
  it('révéler une tornade relocalise le coffre et arme pendingTornado', () => {
    const game = createTreasureGame(123)

    const tornado = findCell(game, 110, (c) => c.isTornado)
    expect(tornado, 'aucune tornade matérialisée dans la région scannée').toBeTruthy()

    getCell(game, tornado.x, tornado.y - 1).revealed = true
    const before = game.tornadoCount

    revealCell(game, getCell(game, tornado.x, tornado.y))

    expect(game.tornadoCount).toBe(before + 1)
    expect(game.chest).toEqual(chestPositionFor(game.seed, before + 1))
    expect(game.pendingTornado).toBe(true)
  })
})

describe('trésor — vies', () => {
  // Ramasse `count` mines deux à deux espacées d'au moins 4 sur un axe : ça
  // garantit que la case-voisine qu'on marquera révélée pour l'une n'est
  // jamais une autre mine-cible.
  function spacedMines(game, count) {
    const mines = []
    for (let y = -70; y <= 70 && mines.length < count; y++) {
      for (let x = -70; x <= 70 && mines.length < count; x++) {
        const cell = getCell(game, x, y)
        if (!cell.isMine) continue
        const farEnough = mines.every(
          (m) => Math.abs(m.x - x) >= 4 || Math.abs(m.y - y) >= 4,
        )
        if (farEnough) mines.push(cell)
      }
    }
    return mines
  }

  function detonate(game, mine) {
    getCell(game, mine.x, mine.y - 1).revealed = true // voisin révélé → pas "trop loin"
    revealCell(game, getCell(game, mine.x, mine.y))
  }

  it('la 3e mine termine la journée (status "lost")', () => {
    const game = createTreasureGame(55)
    const mines = spacedMines(game, 3)
    expect(mines).toHaveLength(3)

    detonate(game, mines[0])
    detonate(game, mines[1])
    expect(game.status).toBe('playing')
    expect(game.minesTriggeredCount).toBe(2)

    detonate(game, mines[2])
    expect(game.status).toBe('lost')
    expect(game.minesTriggeredCount).toBe(3)
  })

  it('avec unlimitedLives, la 3e mine ne termine pas la journée', () => {
    const game = createTreasureGame(55, { unlimitedLives: true })
    const mines = spacedMines(game, 3) // même seed → même layout

    detonate(game, mines[0])
    detonate(game, mines[1])
    detonate(game, mines[2])

    expect(game.minesTriggeredCount).toBe(3)
    expect(game.status).toBe('playing')
  })
})

describe('trésor — treasureWinReward', () => {
  it('table complète : 0→3, 1→2, 2→1, 3→0 ; +1 si au moins une tornade', () => {
    expect(treasureWinReward(0, 0)).toBe(3)
    expect(treasureWinReward(1, 0)).toBe(2)
    expect(treasureWinReward(2, 0)).toBe(1)
    expect(treasureWinReward(3, 0)).toBe(0)

    expect(treasureWinReward(0, 1)).toBe(4)
    expect(treasureWinReward(1, 3)).toBe(3)
    expect(treasureWinReward(2, 1)).toBe(2)
    expect(treasureWinReward(3, 9)).toBe(1)

    // minesTriggeredCount au-delà de 3 reste borné à 0 (Math.max).
    expect(treasureWinReward(5, 0)).toBe(0)
    expect(treasureWinReward(5, 2)).toBe(1)
  })
})
