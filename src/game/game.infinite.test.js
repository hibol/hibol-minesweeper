import { describe, it, expect } from 'vitest'
import {
  createInfiniteGame,
  getCell,
  getNeighbors,
  getVisibleCells,
  revealCell,
  isTooFarToReveal,
  MAX_OPENING_REVEAL,
} from './game.js'

// Le mode infini est déterministe : tout dérive d'un hash de (seed, x, y).
// Aucune de ces vérifs ne mock quoi que ce soit — on lit juste le plateau
// généré. `getCell` sur une partie infinie matérialise la case à la demande
// (via createInfiniteCell → isMineForGame), donc l'échantillonner suffit à
// tester le placement des mines sans exporter les internes.

describe('infini — ouverture de départ', () => {
  it('ouvre la poche autour de (0,0) sans dépasser MAX_OPENING_REVEAL', () => {
    for (const seed of [1, 7, 99, 12345]) {
      const game = createInfiniteGame(seed)

      expect(getCell(game, 0, 0).revealed).toBe(true)
      expect(game.revealedCount).toBeGreaterThan(0)
      expect(game.revealedCount).toBeLessThanOrEqual(MAX_OPENING_REVEAL)
    }
  })
})

describe('infini — déterminisme du placement', () => {
  it('même seed → mêmes mines sur une région échantillonnée (2 créations)', () => {
    for (const seed of [12345, 99]) {
      const a = createInfiniteGame(seed)
      const b = createInfiniteGame(seed)

      // La boucle interne de createInfiniteGame peut décaler la seed
      // effective si l'ouverture est trop grosse — mais de façon
      // déterministe, donc les deux parties atterrissent sur la même.
      expect(a.seed).toBe(b.seed)

      for (let y = -8; y <= 8; y++) {
        for (let x = -8; x <= 8; x++) {
          expect(
            getCell(a, x, y).isMine,
            `seed ${seed} @ (${x},${y})`,
          ).toBe(getCell(b, x, y).isMine)
        }
      }
    }
  })
})

describe('infini — isTooFarToReveal', () => {
  it('vrai pour une case détachée, faux pour une case collée à la zone explorée', () => {
    const game = createInfiniteGame(3)

    // Case lointaine, sans aucun voisin révélé.
    expect(isTooFarToReveal(game, getCell(game, 300, 300))).toBe(true)

    // Case cachée en bordure immédiate de la poche ouverte.
    let frontier
    for (const cell of game.cells.values()) {
      if (!cell.revealed) continue
      frontier = getNeighbors(game, cell).find((n) => !n.revealed && !n.flagged)
      if (frontier) break
    }
    expect(frontier, 'attendu : une case cachée en bord de poche').toBeDefined()
    expect(isTooFarToReveal(game, frontier)).toBe(false)
  })

  it('revealCell sur une case trop loin est un no-op', () => {
    const game = createInfiniteGame(3)
    const far = getCell(game, 300, 300)

    revealCell(game, far)

    expect(far.revealed).toBe(false)
  })
})

describe('infini — révéler une mine ne termine pas la partie', () => {
  it('status reste "playing", minesTriggeredCount++ et maxDistance suit', () => {
    const game = createInfiniteGame(3)

    // Une mine collée à la poche ouverte : une case révélée numérotée a
    // forcément une voisine minée (non révélée).
    let mine
    for (const cell of game.cells.values()) {
      if (!cell.revealed) continue
      mine = getNeighbors(game, cell).find((n) => n.isMine && !n.revealed)
      if (mine) break
    }
    expect(mine, 'attendu : une mine en bord de poche').toBeDefined()

    const distance = Math.hypot(mine.x, mine.y)
    revealCell(game, mine)

    expect(game.status).toBe('playing')
    expect(game.minesTriggeredCount).toBe(1)
    expect(mine.revealed).toBe(true)
    expect(game.maxDistance).toBeGreaterThanOrEqual(distance - 1e-9)
  })
})

describe('infini — getVisibleCells', () => {
  it('matérialise et renvoie la fenêtre demandée, ligne par ligne', () => {
    const game = createInfiniteGame(1)

    const cells = getVisibleCells(game, 5, 5, 4, 3)

    expect(cells).toHaveLength(12)
    expect(cells[0]).toBe(getCell(game, 5, 5)) // coin haut-gauche
    expect(cells.at(-1)).toBe(getCell(game, 8, 7)) // coin bas-droite
  })
})

describe('infini — safe zone d’origine', () => {
  it('jamais de mine dans le 3x3 autour de (0,0)', () => {
    for (const seed of [1, 2, 7, 42]) {
      const game = createInfiniteGame(seed)
      for (let y = -1; y <= 1; y++) {
        for (let x = -1; x <= 1; x++) {
          expect(getCell(game, x, y).isMine, `seed ${seed} @ (${x},${y})`).toBe(false)
        }
      }
    }
  })
})
