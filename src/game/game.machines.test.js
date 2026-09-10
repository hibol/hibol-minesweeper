import { describe, it, expect } from 'vitest'
import {
  createInfiniteGame,
  createTreasureGame,
  getCell,
  getDarkness,
  useWindMachine,
  useXrayMachine,
  useTravelMachine,
  XRAY_RADIUS,
  TRAVEL_MIN_CLEARANCE,
} from './game.js'

// Les 3 consommables du shop (Infini uniquement). Déterministes : ils lisent
// le même plateau haché. Aucun mock.

describe('machines — useWindMachine', () => {
  it('remonte heartsCollectedCount à hauteur des mines, darkness → 0, mines inchangées', () => {
    const game = createInfiniteGame(1)
    game.minesTriggeredCount = 6
    game.heartsCollectedCount = 2

    useWindMachine(game)

    expect(game.heartsCollectedCount).toBe(6)
    expect(game.minesTriggeredCount).toBe(6)
    expect(getDarkness(game)).toBe(0)
  })

  it('ne baisse jamais heartsCollectedCount s’il dépasse déjà les mines', () => {
    const game = createInfiniteGame(1)
    game.minesTriggeredCount = 3
    game.heartsCollectedCount = 10

    useWindMachine(game)

    expect(game.heartsCollectedCount).toBe(10)
  })

  it('no-op hors mode infini', () => {
    const game = createTreasureGame(1)
    game.minesTriggeredCount = 5
    game.heartsCollectedCount = 0

    useWindMachine(game)

    expect(game.heartsCollectedCount).toBe(0)
  })
})

describe('machines — useXrayMachine', () => {
  // Un disque loin de la poche d'ouverture pour ne pas mélanger avec les cases
  // révélées au lancement.
  const CX = 200
  const CY = 0

  it('ne révèle QUE des mines, sans les compteurs de dégât, et renvoie leur nombre', () => {
    const game = createInfiniteGame(1)
    const before = game.minesTriggeredCount

    const revealed = useXrayMachine(game, CX, CY)
    expect(revealed).toBeGreaterThan(0) // densité ~0.25 à cette distance

    let minesInDisk = 0
    for (const cell of game.cells.values()) {
      const inDisk = (cell.x - CX) ** 2 + (cell.y - CY) ** 2 <= XRAY_RADIUS * XRAY_RADIUS
      if (!inDisk) continue
      // toute case matérialisée dans le disque est une mine révélée…
      expect(cell.isMine).toBe(true)
      expect(cell.revealed).toBe(true)
      // …et l'objet informe sans déclencher : pas de tilt, pas de "wrong".
      expect(cell.tiltDeg).toBe(0)
      expect(cell.wrong).toBe(false)
      minesInDisk++
    }

    expect(minesInDisk).toBe(revealed)
    expect(game.minesTriggeredCount).toBe(before) // aucune mine "déclenchée"
  })

  it('ne matérialise pas les cases sûres du disque', () => {
    const game = createInfiniteGame(1)
    useXrayMachine(game, CX, CY)

    for (let dy = -XRAY_RADIUS; dy <= XRAY_RADIUS; dy++) {
      for (let dx = -XRAY_RADIUS; dx <= XRAY_RADIUS; dx++) {
        if (dx * dx + dy * dy > XRAY_RADIUS * XRAY_RADIUS) continue
        const cell = game.cells.get(`${CX + dx},${CY + dy}`)
        if (cell) expect(cell.isMine).toBe(true) // seules les mines existent
      }
    }
  })

  it('no-op hors mode infini (renvoie 0)', () => {
    const treasure = createTreasureGame(1)
    expect(useXrayMachine(treasure, 0, 0)).toBe(0)
  })
})

describe('machines — useTravelMachine', () => {
  it('atterrit à ≥ TRAVEL_MIN_CLEARANCE de toute case déjà révélée, plante une safeZone et ouvre une cascade', () => {
    const game = createInfiniteGame(1)

    const revealedBefore = [...game.cells.values()].filter((c) => c.revealed)
    const safeZonesBefore = game.safeZones.length
    const revealedCountBefore = game.revealedCount

    const arrival = useTravelMachine(game, 0, 0, 0) // direction +x

    expect(arrival).not.toBeNull()

    // Écart à toute case révélée d'avant le saut (tolérance ~1 : x/y arrondis).
    for (const cell of revealedBefore) {
      const dist = Math.hypot(cell.x - arrival.x, cell.y - arrival.y)
      expect(dist).toBeGreaterThanOrEqual(TRAVEL_MIN_CLEARANCE - 1)
    }

    // Une poche forcée sans mine a été poussée, et c'est le point d'arrivée.
    expect(game.safeZones.length).toBe(safeZonesBefore + 1)
    expect(game.safeZones.at(-1)).toEqual(arrival)

    // Cascade au point d'arrivée (5x5 sans mine ⇒ 0 voisin ⇒ flood).
    const landing = getCell(game, arrival.x, arrival.y)
    expect(landing.revealed).toBe(true)
    expect(landing.neighborMines).toBe(0)
    expect(game.revealedCount).toBeGreaterThan(revealedCountBefore)

    // Borne TRAVEL_MAX_REACH (400) respectée.
    expect(Math.hypot(arrival.x, arrival.y)).toBeLessThanOrEqual(400)
  })

  it('avance tant que le point d’arrivée retombe dans la zone révélée (boucle interne)', () => {
    const game = createInfiniteGame(1)
    // Matérialise une case NON révélée dans la Map : hasRevealedWithin doit la
    // sauter (sans elle, une partie fraîche n'a que des cases révélées en
    // mémoire — un mine n'entre jamais dans la Map à l'ouverture).
    getCell(game, 250, 250)

    // On part du bord de la poche en visant l'origine : le 1er point d'arrivée
    // (à TRAVEL_MIN_CLEARANCE) tombe en plein dans la poche ouverte → la
    // boucle doit pousser plus loin que la distance minimale.
    const from = { x: 4, y: 0 }
    const arrival = useTravelMachine(game, from.x, from.y, Math.PI) // direction -x

    expect(arrival).not.toBeNull()
    expect(Math.hypot(arrival.x - from.x, arrival.y - from.y)).toBeGreaterThan(TRAVEL_MIN_CLEARANCE)
  })

  it('renvoie null si la partie n’est pas en cours', () => {
    const game = createInfiniteGame(1)
    game.status = 'lost'
    expect(useTravelMachine(game, 0, 0, 0)).toBeNull()
  })

  it('renvoie null hors mode infini', () => {
    const treasure = createTreasureGame(1)
    expect(useTravelMachine(treasure, 0, 0, 0)).toBeNull()
  })
})
