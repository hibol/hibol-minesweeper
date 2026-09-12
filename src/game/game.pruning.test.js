import { describe, it, expect } from 'vitest'
import {
  createInfiniteGame,
  createGame,
  getCell,
  pruneUntouchedCells,
  toggleFlag
} from './game.js'

// pruneUntouchedCells borne la mémoire d'une longue session infinie (game.cells
// est une Map réactive Vue jamais purgée ailleurs, cf. commentaire dans
// game.js — cause plausible d'un crash mémoire mobile après une longue
// exploration). Ces tests vérifient la seule propriété qui compte : purger ne
// doit JAMAIS changer ce que la partie renvoie ensuite, seulement sa mémoire.

describe('pruneUntouchedCells — cases jamais touchées', () => {
  it('supprime de game.cells une case jamais révélée/flaggée/tiltée hors de la zone à conserver', () => {
    const game = createInfiniteGame(42)

    // Matérialise une case loin de tout, jamais interagie.
    getCell(game, 500, 500)
    expect(game.cells.has('500,500')).toBe(true)

    pruneUntouchedCells(game, -5, -5, 5, 5)

    expect(game.cells.has('500,500')).toBe(false)
  })

  it('conserve les cases à l’intérieur de la zone à conserver', () => {
    const game = createInfiniteGame(42)

    getCell(game, 3, -2)
    pruneUntouchedCells(game, -5, -5, 5, 5)

    expect(game.cells.has('3,-2')).toBe(true)
  })

  it('une case purgée puis revisitée est identique à avant (déterminisme depuis seed)', () => {
    const game = createInfiniteGame(42)

    const before = getCell(game, 500, 500)
    const snapshot = {
      isMine: before.isMine,
      isHeart: before.isHeart,
      isRobot: before.isRobot,
      isTornado: before.isTornado,
      neighborMines: before.neighborMines
    }

    pruneUntouchedCells(game, -5, -5, 5, 5)
    expect(game.cells.has('500,500')).toBe(false)

    const after = getCell(game, 500, 500)

    expect(after).not.toBe(before) // nouvel objet…
    expect({
      isMine: after.isMine,
      isHeart: after.isHeart,
      isRobot: after.isRobot,
      isTornado: after.isTornado,
      neighborMines: after.neighborMines
    }).toEqual(snapshot) // …mais contenu identique
  })
})

describe('pruneUntouchedCells — cases touchées', () => {
  it('ne supprime jamais une case révélée, même hors de la zone à conserver', () => {
    const game = createInfiniteGame(42)

    const far = getCell(game, 500, 500)
    far.revealed = true

    pruneUntouchedCells(game, -5, -5, 5, 5)

    expect(game.cells.has('500,500')).toBe(true)
  })

  it('ne supprime jamais une case flaggée, même hors de la zone à conserver', () => {
    const game = createInfiniteGame(42)

    getCell(game, 500, 500)
    toggleFlag(game, getCell(game, 500, 500))
    expect(getCell(game, 500, 500).flagged).toBe(true)

    pruneUntouchedCells(game, -5, -5, 5, 5)

    expect(game.cells.has('500,500')).toBe(true)
  })

  it('ne supprime jamais une case tiltée (voisine jostlée par une mine), même hors zone', () => {
    const game = createInfiniteGame(42)

    const far = getCell(game, 500, 500)
    far.tiltDeg = 7 // simule un jostleNeighbors sans faire exploser de vraie mine

    pruneUntouchedCells(game, -5, -5, 5, 5)

    expect(game.cells.has('500,500')).toBe(true)
  })

  it('la purge n’efface jamais les cases révélées à l’ouverture de départ, une fois le joueur reparti ailleurs', () => {
    const game = createInfiniteGame(42)

    const revealedAtStart = [...game.cells.values()].filter((c) => c.revealed)
    expect(revealedAtStart.length).toBeGreaterThan(0)

    // Le joueur part explorer loin de l'origine : la poche de départ sort de
    // la fenêtre de rendu.
    pruneUntouchedCells(game, 495, 495, 505, 505)

    for (const cell of revealedAtStart) {
      expect(game.cells.has(`${cell.x},${cell.y}`)).toBe(true)
    }
  })
})

describe('pruneUntouchedCells — classic/legacy', () => {
  it('ne touche pas une partie classic (grille fixe, non concernée)', () => {
    const game = createGame(10, 10, 20)
    const sizeBefore = game.cells.size

    pruneUntouchedCells(game, 0, 0, 0, 0)

    expect(game.cells.size).toBe(sizeBefore)
  })
})
