import { describe, it, expect } from 'vitest'
import {
  createGame,
  getCell,
  getNeighbors,
  countNeighborMines,
  revealCell,
  toggleFlag,
} from './game.js'

// JALON 1 — tests d'INVARIANTS uniquement. Aucun mock de Math.random.
//
// Deux familles :
//   - INVARIANT : on lance de vraies parties (placement aléatoire réel) et on
//     vérifie une propriété vraie QUEL QUE SOIT le tirage. On répète sur
//     plusieurs parties pour balayer la variété du RNG.
//   - PLATEAU À LA MAIN : quand un test a besoin d'un layout précis, on crée
//     une partie à 0 mine (`createGame(w, h, 0)` → placeMines ne fait rien),
//     on désarme `firstMove` (sinon le 1er revealCell relance ensureSafeZone
//     et redistribue nos mines), on pose nous-mêmes `isMine` sur les cases
//     choisies, puis `countNeighborMines(game)` recompte les chiffres. On ne
//     dépend jamais du placement aléatoire.

// Petit atelier de plateau à la main.
function handBuiltGame(width, height, minePositions) {
  const game = createGame(width, height, 0)
  game.firstMove = false // désarme ensureSafeZone au 1er clic

  for (const [x, y] of minePositions) {
    getCell(game, x, y).isMine = true
  }

  countNeighborMines(game)
  return game
}

describe('classic — sécurité du premier clic (INVARIANT)', () => {
  it('ne laisse jamais de mine sur la case cliquée ni ses 8 voisines', () => {
    // 40 parties fraîches : ensureSafeZone doit à chaque fois avoir déplacé
    // toute mine qui serait tombée dans le 3x3 autour du 1er clic.
    for (let trial = 0; trial < 40; trial++) {
      const game = createGame(9, 9, 10)
      const target = getCell(game, 4, 4)

      revealCell(game, target)

      const safeZone = [target, ...getNeighbors(game, target)]
      for (const cell of safeZone) {
        expect(
          cell.isMine,
          `partie ${trial} : (${cell.x},${cell.y}) ne devrait pas être minée`,
        ).toBe(false)
      }
    }
  })
})

describe('classic — nombre de mines (INVARIANT)', () => {
  it('createGame(10, 10, 20) pose exactement 20 mines', () => {
    for (let trial = 0; trial < 20; trial++) {
      const game = createGame(10, 10, 20)
      const mineCount = [...game.cells.values()].filter((c) => c.isMine).length
      expect(mineCount).toBe(20)
    }
  })
})

describe('classic — flood-fill (PLATEAU À LA MAIN)', () => {
  it('révéler le centre d’une poche à 0 voisin ouvre toute la poche, bornée par les murs de mines', () => {
    // Mur de mines en croix : colonne x=5 et ligne y=5 entièrement minées.
    // Il isole le bloc supérieur-gauche (x:0..4, y:0..4) du reste.
    const mines = []
    for (let i = 0; i < 10; i++) {
      mines.push([5, i], [i, 5])
    }
    const game = handBuiltGame(10, 10, mines)

    revealCell(game, getCell(game, 0, 0))

    // Toute la poche 5x5 est ouverte (les cases collées au mur sont
    // numérotées mais révélées quand même, elles ne recursent juste pas).
    for (let y = 0; y <= 4; y++) {
      for (let x = 0; x <= 4; x++) {
        expect(getCell(game, x, y).revealed, `(${x},${y})`).toBe(true)
      }
    }

    // Rien de l’autre côté du mur.
    for (let y = 6; y <= 9; y++) {
      for (let x = 0; x <= 9; x++) {
        expect(getCell(game, x, y).revealed, `(${x},${y})`).toBe(false)
      }
    }
    for (let x = 6; x <= 9; x++) {
      for (let y = 0; y <= 9; y++) {
        expect(getCell(game, x, y).revealed, `(${x},${y})`).toBe(false)
      }
    }

    // Les murs de mines eux-mêmes restent cachés (partie non perdue).
    for (let i = 0; i < 10; i++) {
      expect(getCell(game, 5, i).revealed).toBe(false)
      expect(getCell(game, i, 5).revealed).toBe(false)
    }
    expect(game.status).toBe('playing')
  })
})

describe('classic — chord / revealCell sur case révélée numérotée (PLATEAU À LA MAIN)', () => {
  it('ouvre les voisins quand le compte de drapeaux colle', () => {
    // Une seule mine en (1,1) → (0,0) affiche "1".
    const game = handBuiltGame(10, 10, [[1, 1]])
    revealCell(game, getCell(game, 0, 0))
    toggleFlag(game, getCell(game, 1, 1))

    revealCell(game, getCell(game, 0, 0)) // chord

    expect(getCell(game, 1, 0).revealed).toBe(true)
    expect(getCell(game, 0, 1).revealed).toBe(true)
    expect(getCell(game, 1, 1).revealed).toBe(false) // toujours drapeautée
    expect(game.status).toBe('playing')
  })

  it('détonne et marque `wrong` si un des drapeaux est faux', () => {
    // Mine réelle en (1,1). Le joueur drapeaute (0,1) par erreur : le compte
    // autour de (0,0) "colle" quand même (1 drapeau = 1 mine attendue), donc
    // le chord part… et ouvre la vraie mine (1,1).
    const game = handBuiltGame(10, 10, [[1, 1]])
    revealCell(game, getCell(game, 0, 0))
    toggleFlag(game, getCell(game, 0, 1)) // faux drapeau

    revealCell(game, getCell(game, 0, 0)) // chord

    expect(game.status).toBe('lost')
    expect(getCell(game, 1, 1).detonated).toBe(true)
    expect(getCell(game, 0, 1).wrong).toBe(true)
  })

  it('ne fait rien si le compte de drapeaux ne colle pas', () => {
    // Deux mines autour de (0,0) → il affiche "2", mais aucun drapeau posé.
    const game = handBuiltGame(10, 10, [
      [1, 1],
      [0, 1],
    ])
    revealCell(game, getCell(game, 0, 0))

    revealCell(game, getCell(game, 0, 0)) // chord tenté

    expect(getCell(game, 1, 0).revealed).toBe(false)
    expect(getCell(game, 0, 1).revealed).toBe(false)
    expect(getCell(game, 1, 1).revealed).toBe(false)
    expect(game.status).toBe('playing')
  })
})

describe('classic — revealCell : refus silencieux (INVARIANT)', () => {
  it('no-op sur une case drapeautée', () => {
    const game = createGame(8, 8, 10)
    const cell = getCell(game, 2, 2)
    toggleFlag(game, cell)

    revealCell(game, cell)

    expect(cell.revealed).toBe(false)
  })

  it('no-op quand la partie est finie', () => {
    const game = createGame(8, 8, 10)
    game.status = 'lost'
    const hidden = [...game.cells.values()].find((c) => !c.revealed)

    revealCell(game, hidden)

    expect(hidden.revealed).toBe(false)
  })
})

describe('classic — victoire (INVARIANT)', () => {
  it('révéler toutes les cases non minées passe le status à "won"', () => {
    const game = createGame(8, 8, 10)
    revealCell(game, getCell(game, 0, 0)) // consomme firstMove, fige les mines

    for (const cell of [...game.cells.values()]) {
      if (!cell.isMine) {
        revealCell(game, cell)
      }
    }

    expect(game.status).toBe('won')
    expect(game.revealedCount).toBe(8 * 8 - 10)
  })
})

describe('classic — défaite (INVARIANT)', () => {
  it('révéler une mine passe "lost", marque `detonated`, et révèle les autres mines', () => {
    const game = createGame(8, 8, 10)
    revealCell(game, getCell(game, 0, 0))

    const mine = [...game.cells.values()].find((c) => c.isMine)
    revealCell(game, mine)

    expect(game.status).toBe('lost')
    expect(mine.detonated).toBe(true)

    // revealAllMines : toute mine non drapeautée est révélée (aucun drapeau ici).
    for (const cell of game.cells.values()) {
      if (cell.isMine && !cell.flagged) {
        expect(cell.revealed).toBe(true)
      }
    }
  })
})

describe('classic — toggleFlag (INVARIANT)', () => {
  it('met à jour flaggedCount et latch `everFlagged` (jamais remis à false)', () => {
    const game = createGame(8, 8, 10)
    const cell = getCell(game, 3, 3)

    toggleFlag(game, cell)
    expect(cell.flagged).toBe(true)
    expect(game.flaggedCount).toBe(1)
    expect(game.everFlagged).toBe(true)

    toggleFlag(game, cell) // on retire le drapeau
    expect(cell.flagged).toBe(false)
    expect(game.flaggedCount).toBe(0)
    expect(game.everFlagged).toBe(true) // latché
  })

  it('no-op sur une case déjà révélée', () => {
    const game = createGame(8, 8, 10)
    revealCell(game, getCell(game, 0, 0))
    const cell = getCell(game, 0, 0)

    toggleFlag(game, cell)

    expect(cell.flagged).toBe(false)
    expect(game.flaggedCount).toBe(0)
  })

  it('no-op quand la partie est finie', () => {
    const game = createGame(8, 8, 10)
    game.status = 'won'
    const hidden = [...game.cells.values()].find((c) => !c.revealed)

    toggleFlag(game, hidden)

    expect(hidden.flagged).toBe(false)
    expect(game.flaggedCount).toBe(0)
  })
})
