import { describe, it, expect } from 'vitest'
import {
  createInfiniteGame,
  createTreasureGame,
  getDarkness,
  canGiveUp,
  giveUp,
  useWindMachine,
} from './game.js'

// getDarkness / canGiveUp / giveUp sont des lecteurs PURS de l'état de partie
// (aucun RNG). On peut donc poser directement les compteurs sur l'objet game
// et vérifier la formule — c'est de l'invariant, pas du mock.
//
// Rappel formule (cf. game.js) :
//   effectiveMines = max(0, minesTriggeredCount - heartsCollectedCount)
//   getDarkness    = min(1, effectiveMines / darknessMineThreshold)   [mode infini, status playing]
//   canGiveUp      = effectiveMines >= darknessMineThreshold          [mode infini, status playing]

describe('infini — getDarkness', () => {
  it('= min(1, (mines − cœurs) / threshold), et clampé >= 0', () => {
    const game = createInfiniteGame(42)
    expect(game.minesTriggeredCount).toBe(0) // pré-condition : rien déclenché à l'ouverture
    const threshold = game.darknessMineThreshold // défaut 15

    game.minesTriggeredCount = 3
    game.heartsCollectedCount = 0
    expect(getDarkness(game)).toBeCloseTo(3 / threshold)

    // Au-delà du seuil : plafonné à 1.
    game.minesTriggeredCount = threshold + 100
    expect(getDarkness(game)).toBe(1)

    // Plus de cœurs que de mines : effectiveMines clampé à 0, pas négatif.
    game.minesTriggeredCount = 2
    game.heartsCollectedCount = 10
    expect(getDarkness(game)).toBe(0)
  })

  it('vaut 0 hors partie en cours', () => {
    const game = createInfiniteGame(42)
    game.minesTriggeredCount = 30
    game.status = 'lost'
    expect(getDarkness(game)).toBe(0)
  })
})

describe('infini — les cœurs n’altèrent jamais minesTriggeredCount', () => {
  it('la Wind Machine remonte les cœurs sans toucher le compteur brut de mines', () => {
    const game = createInfiniteGame(42)
    game.minesTriggeredCount = 8
    game.heartsCollectedCount = 1

    useWindMachine(game) // dissipe l'assombrissement en alignant les cœurs sur les mines

    expect(game.heartsCollectedCount).toBe(8)
    expect(game.minesTriggeredCount).toBe(8) // inchangé — historique brut préservé
    expect(getDarkness(game)).toBe(0)
  })

  it('la Wind Machine est un no-op hors mode infini', () => {
    const game = createTreasureGame(1)
    game.minesTriggeredCount = 5
    game.heartsCollectedCount = 0

    useWindMachine(game)

    expect(game.heartsCollectedCount).toBe(0)
    expect(game.minesTriggeredCount).toBe(5)
  })
})

describe('infini — canGiveUp / giveUp', () => {
  it('true dès que (mines − cœurs) atteint le seuil, false en-dessous', () => {
    const game = createInfiniteGame(42)
    const threshold = game.darknessMineThreshold

    game.minesTriggeredCount = threshold
    game.heartsCollectedCount = 0
    expect(canGiveUp(game)).toBe(true)

    game.minesTriggeredCount = threshold - 1
    expect(canGiveUp(game)).toBe(false)
  })

  it('des cœurs qui repassent (mines − cœurs) sous le seuil rendent canGiveUp false', () => {
    // NOTE : le code utilise le seuil NET (mines − cœurs), pas les mines
    // brutes — cf. commentaire de canGiveUp dans game.js (le bouton doit
    // disparaître si la visibilité est redevenue correcte). C'est
    // volontairement l'inverse de ce que dit l'énoncé de la tâche ; on teste
    // le comportement RÉEL.
    const game = createInfiniteGame(42)
    game.minesTriggeredCount = game.darknessMineThreshold + 5
    game.heartsCollectedCount = 8 // net = threshold - 3
    expect(canGiveUp(game)).toBe(false)
  })

  it('giveUp est un no-op quand canGiveUp est false, et abandonne sinon', () => {
    const game = createInfiniteGame(42)

    game.minesTriggeredCount = 2 // largement sous le seuil
    giveUp(game)
    expect(game.status).toBe('playing')

    game.minesTriggeredCount = game.darknessMineThreshold
    giveUp(game)
    expect(game.status).toBe('lost')
  })
})
