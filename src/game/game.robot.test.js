import { describe, it, expect } from 'vitest'
import { createInfiniteGame, getCell, revealCell } from './game.js'

// performRobotWalk n'est pas exporté : on le déclenche via revealCell sur une
// case isRobot, et on lit le trajet dans game.pendingRobotTrails[0].steps.
//
// La marche TIRE AU SORT la case suivante parmi ses candidates → INVARIANT
// ONLY. On construit donc des « pièces » à la main : un rectangle de cases
// entièrement pré-peuplé (bordure `revealed`, intérieur vide) pour que
// getNeighbors ne matérialise jamais une case hachée. Chaque scénario ne
// laisse qu'UNE candidate par pas → trajet déterministe malgré le RNG.

const ROBOT_MAX_STEPS = 10 // constante interne de game.js, non exportée

function baseCell(x, y, props) {
  return {
    x, y,
    isMine: false, isHeart: false, isRobot: false, isTornado: false,
    revealed: false, flagged: false, wrong: false,
    neighborMines: 0, tiltDeg: 0, pendingReveal: false, robotHere: false,
    ...props,
  }
}

// Rectangle intérieur [x0..x1] x [y0..y1], ceinturé d'un anneau `revealed`
// (jamais candidat, jamais re-matérialisé). `overrides` : { "x,y": props }.
function room(x0, y0, x1, y1, overrides = {}) {
  const game = createInfiniteGame(1)
  game.cells.clear()
  Object.assign(game, {
    revealedCount: 0, flaggedCount: 0, minesTriggeredCount: 0,
    heartsCollectedCount: 0, robotsTriggeredCount: 0, maxDistance: 0,
    pendingRobotTrails: [], robotWalkInProgress: false, openingInProgress: false,
  })

  for (let y = y0 - 1; y <= y1 + 1; y++) {
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      const border = x < x0 || x > x1 || y < y0 || y > y1
      game.cells.set(`${x},${y}`, baseCell(x, y, border ? { revealed: true } : {}))
    }
  }
  for (const [key, props] of Object.entries(overrides)) {
    Object.assign(game.cells.get(key), props)
  }
  return game
}

function walk(game, robotKey) {
  revealCell(game, game.cells.get(robotKey))
  return game.pendingRobotTrails[0]
}

describe('robot — déclenchement', () => {
  it('révéler une case isRobot ⇒ robotsTriggeredCount++ et un trail poussé', () => {
    // Robot encerclé de cases révélées : la marche est vide, mais le trail existe.
    const game = room(0, 0, 0, 0, { '0,0': { isRobot: true, neighborMines: 1 } })

    const trail = walk(game, '0,0')

    expect(game.robotsTriggeredCount).toBe(1)
    expect(game.pendingRobotTrails).toHaveLength(1)
    expect(trail.origin).toBe(game.cells.get('0,0'))
    expect(Array.isArray(trail.steps)).toBe(true)
    expect(trail.steps).toHaveLength(0) // encerclé → aucun pas
  })
})

describe('robot — fins de marche', () => {
  it('longueur ≤ ROBOT_MAX_STEPS (couloir plus long que la marche)', () => {
    // Couloir est de 12 cases, toutes numérotées (neighborMines 1) → pas de
    // cascade, une seule candidate par pas.
    const overrides = { '0,0': { isRobot: true, neighborMines: 1 } }
    for (let x = 1; x <= 12; x++) overrides[`${x},0`] = { neighborMines: 1 }
    const game = room(0, 0, 12, 0, overrides)

    const { steps } = walk(game, '0,0')

    expect(steps.length).toBeLessThanOrEqual(ROBOT_MAX_STEPS)
    expect(steps.length).toBe(ROBOT_MAX_STEPS) // le couloir est plus long
    expect(steps.map((s) => s.lead.x)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(steps.every((s) => s.opened.length === 0)).toBe(true)
  })

  it('s’arrête quand la case courante est encerclée de cases révélées', () => {
    const game = room(0, 0, 0, 0, { '0,0': { isRobot: true } })
    const { steps } = walk(game, '0,0')
    expect(steps).toHaveLength(0)
  })

  it('s’arrête sur une mine : elle devient `revealed` mais NE compte pas (neutre)', () => {
    // Robot en (0,0), seule case libre = la mine en (1,0), le reste révélé.
    const game = room(0, 0, 1, 0, {
      '0,0': { isRobot: true, neighborMines: 1 },
      '1,0': { isMine: true, neighborMines: 0, revealed: false },
    })
    // referme les autres voisins pour ne laisser que (1,0) comme candidate
    // (l'intérieur ne fait que (0,0) et (1,0), la bordure est déjà `revealed`).

    const { steps } = walk(game, '0,0')

    expect(game.cells.get('1,0').revealed).toBe(true)
    expect(game.minesTriggeredCount).toBe(0) // neutre : pas un clic joueur
    expect(steps).toHaveLength(1)
    expect(steps[0].lead).toBe(game.cells.get('1,0'))
    expect(steps[0].opened).toEqual([])
  })
})

describe('robot — un robot révélé PENDANT une marche ne relance pas la sienne', () => {
  it('robotsTriggeredCount reste à 1', () => {
    const overrides = {
      '0,0': { isRobot: true, neighborMines: 1 },
      '3,0': { isRobot: true, neighborMines: 1 }, // sur le trajet
    }
    for (let x = 1; x <= 12; x++) overrides[`${x},0`] = { ...(overrides[`${x},0`] ?? {}), neighborMines: 1 }
    const game = room(0, 0, 12, 0, overrides)

    walk(game, '0,0')

    expect(game.robotsTriggeredCount).toBe(1)
    expect(game.pendingRobotTrails).toHaveLength(1)
    expect(game.cells.get('3,0').revealed).toBe(true) // bien foulé, juste sans nouvelle marche
  })
})

describe('robot — repart du bord d’une poche qu’il vient d’ouvrir', () => {
  it('après une cascade qui l’encercle, le robot saute au bord et continue', () => {
    // Intérieur surtout à 0 voisin (cascade), avec une "grille" de cases
    // numérotées en x=5 : la cascade s'y arrête, les cases x>5 restent
    // cachées → le robot doit se repositionner sur (5,·) et repartir.
    const overrides = {
      '0,0': { isRobot: true, neighborMines: 1 },
      '0,1': { revealed: true },
      '1,1': { revealed: true },
      '5,0': { neighborMines: 1 },
      '5,1': { neighborMines: 1 },
      '5,2': { neighborMines: 1 },
    }
    const game = room(0, 0, 10, 2, overrides)

    const { steps } = walk(game, '0,0')

    expect(steps.length).toBeGreaterThanOrEqual(2)
    expect(steps[0].opened.length).toBeGreaterThanOrEqual(4) // la poche ouverte
    expect(game.cells.get('6,0').revealed).toBe(true) // franchi la grille après repositionnement
  })
})

describe('robot — forme du retour', () => {
  it('[{ lead, opened }] : opened = cases de la cascade de ce pas', () => {
    // Robot en (0,0). Sa seule case libre est (1,0) (on ferme (0,1)/(1,1)),
    // qui est à 0 voisin → sa cascade ouvre le reste de l'intérieur.
    const game = room(0, 0, 4, 2, {
      '0,0': { isRobot: true, neighborMines: 1 },
      '0,1': { revealed: true },
      '1,1': { revealed: true },
    })

    const { steps } = walk(game, '0,0')

    expect(steps.length).toBeGreaterThanOrEqual(1)
    const first = steps[0]
    expect(first.lead).toBe(game.cells.get('1,0'))
    expect(first.opened.length).toBeGreaterThanOrEqual(3)
    expect(first.opened.every((c) => c.revealed && c !== first.lead)).toBe(true)
    // chaque pas a la même forme
    expect(steps.every((s) => 'lead' in s && Array.isArray(s.opened))).toBe(true)
  })
})
