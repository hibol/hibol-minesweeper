import { describe, it, expect } from "vitest"
import {
  createTreasureGame,
  createInfiniteGame,
  createInfiniteCell,
  restoreTreasureGame,
  chestPositionFor,
  getCell,
  getMineDensity,
  hotspotDebugAt,
  revealCell,
  treasureWinReward,
  triggerTornado,
  CHEST_MIN_DISTANCE,
  CHEST_MAX_DISTANCE,
} from "./game.js"

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

describe("trésor — pas de hotspots (exclusion à la source)", () => {
  it("une case boostée par un hotspot en Infini retombe à l'ambiant en Trésor, même seed/coordonnées", () => {
    const infiniteGame = createInfiniteGame(1)

    let hotspot = null
    for (let y = -300; y <= 300 && !hotspot; y += 2) {
      for (let x = -300; x <= 300; x += 2) {
        const dbg = hotspotDebugAt(infiniteGame, x, y)
        if (dbg && dbg.ratio < 0.1) {
          hotspot = { x, y }
          break
        }
      }
    }
    expect(hotspot, "aucun hotspot trouvé dans la zone balayée").toBeTruthy()

    const boosted = getMineDensity(infiniteGame, hotspot.x, hotspot.y)
    expect(boosted).toBeGreaterThan(0.25) // MAX_DENSITY : preuve que ce point est bien dans un hotspot

    // Même seed et mêmes paramètres de rampe, seul `mode` change : le
    // hotspot doit disparaître, pas juste être plafonné.
    const treasureLike = {
      mode: "treasure",
      seed: infiniteGame.seed,
      baseDensity: infiniteGame.baseDensity,
      densityScale: infiniteGame.densityScale,
    }
    const unboosted = getMineDensity(treasureLike, hotspot.x, hotspot.y)
    expect(unboosted).toBeLessThanOrEqual(0.25)
  })
})

describe("trésor — chestPositionFor", () => {
  it("est déterministe et place le coffre à une distance euclidienne dans [50, 100]", () => {
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

describe("trésor — zone 3x3 forcée sans mine autour du coffre", () => {
  it("couvre toutes les positions du coffre, de k = 0 à tornadoCount", () => {
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

describe("trésor — trouver le coffre", () => {
  it('révéler la case coffre → status "won" + chestFound', () => {
    const game = createTreasureGame(11)
    const chest = game.chest

    // Rend la case coffre atteignable (un voisin révélé suffit).
    getCell(game, chest.x + 1, chest.y).revealed = true
    revealCell(game, getCell(game, chest.x, chest.y))

    expect(game.status).toBe("won")
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
    expect(
      found,
      "aucune seed testée ne donne une case à 0 voisin collée au coffre",
    ).toBeTruthy()

    const { game, dx, dy } = found
    const chest = game.chest
    const launch = getCell(game, chest.x + dx, chest.y + dy)

    // Rend `launch` atteignable depuis le côté opposé au coffre.
    getCell(game, launch.x + dx, launch.y + dy).revealed = true
    revealCell(game, launch) // 0 voisin → cascade → balaye le coffre

    expect(game.status).toBe("won")
    expect(game.chestFound).toBe(true)
    expect(getCell(game, chest.x, chest.y).revealed).toBe(true)
    expect(getCell(game, chest.x, chest.y).isChest).toBe(true)
  })
})

describe("trésor — tornade", () => {
  // La révélation seule (cascade ou clic direct) ne relocalise plus le coffre
  // tout de suite : elle met la case en attente (game.pendingTornadoReveals),
  // à charge de useTornadoReveal.js (App.vue) de la confirmer une fois
  // effectivement dans le viewport — pas de brouillard en trésor, donc "vu" =
  // affiché à l'écran, contrairement aux cœurs en infini (useHeartFogReveal.js).

  it("révéler une tornade ne relocalise PAS le coffre tout de suite — elle est mise en attente", () => {
    const game = createTreasureGame(123)

    const tornado = findCell(game, 110, (c) => c.isTornado)
    expect(
      tornado,
      "aucune tornade matérialisée dans la région scannée",
    ).toBeTruthy()

    getCell(game, tornado.x, tornado.y - 1).revealed = true
    const before = game.tornadoCount
    const chestBefore = game.chest

    revealCell(game, getCell(game, tornado.x, tornado.y))

    expect(game.tornadoCount).toBe(before)
    expect(game.chest).toEqual(chestBefore)
    expect(game.pendingTornado).toBe(false)
    expect(tornado.tornadoTriggered).toBe(false)
    expect(game.pendingTornadoReveals).toContain(tornado)
  })

  it("triggerTornado : relocalise le coffre, arme pendingTornado, marque la case", () => {
    const game = createTreasureGame(123)
    const tornado = findCell(game, 110, (c) => c.isTornado)
    const before = game.tornadoCount

    triggerTornado(game, tornado)

    expect(game.tornadoCount).toBe(before + 1)
    expect(game.chest).toEqual(chestPositionFor(game.seed, before + 1))
    expect(game.pendingTornado).toBe(true)
    expect(tornado.tornadoTriggered).toBe(true)
  })
})

describe("trésor — vies", () => {
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
    expect(game.status).toBe("playing")
    expect(game.minesTriggeredCount).toBe(2)

    detonate(game, mines[2])
    expect(game.status).toBe("lost")
    expect(game.minesTriggeredCount).toBe(3)
  })

  it("avec unlimitedLives, la 3e mine ne termine pas la journée", () => {
    const game = createTreasureGame(55, { unlimitedLives: true })
    const mines = spacedMines(game, 3) // même seed → même layout

    detonate(game, mines[0])
    detonate(game, mines[1])
    detonate(game, mines[2])

    expect(game.minesTriggeredCount).toBe(3)
    expect(game.status).toBe("playing")
  })
})

describe("trésor — treasureWinReward", () => {
  it("table complète : 0→3, 1→2, 2→1, 3→0 ; +1 si au moins une tornade", () => {
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

describe("trésor — hibols disséminés", () => {
  it("isHibol est déterministe pour une seed donnée", () => {
    const a = createTreasureGame(7)
    const b = createTreasureGame(7)
    expect(a.seed).toBe(b.seed)

    let found = 0
    for (let y = -260; y <= 260; y += 3) {
      for (let x = -260; x <= 260; x += 3) {
        const cellA = createInfiniteCell(a, x, y)
        const cellB = createInfiniteCell(b, x, y)
        expect(cellB.isHibol, `(${x},${y})`).toBe(cellA.isHibol)
        if (cellA.isHibol) found++
      }
    }
    expect(found, "aucun hibol trouvé dans la zone balayée").toBeGreaterThan(0)
  })

  it("jamais un hibol sur une mine, une tornade, ou dans le 3x3 du coffre du jour", () => {
    const game = createTreasureGame(7)

    for (let y = -260; y <= 260; y += 2) {
      for (let x = -260; x <= 260; x += 2) {
        const cell = createInfiniteCell(game, x, y)
        if (!cell.isHibol) {
          continue
        }
        expect(cell.isMine, `(${x},${y})`).toBe(false)
        expect(cell.isTornado, `(${x},${y})`).toBe(false)
        const inChestZone =
          Math.abs(x - game.chest.x) <= 1 && Math.abs(y - game.chest.y) <= 1
        expect(inChestZone, `(${x},${y})`).toBe(false)
      }
    }
  })

  it("aucun hibol dans la poche d'ouverture (openingInProgress)", () => {
    const game = createTreasureGame(7)
    game.openingInProgress = true

    let any = false
    for (let y = -6; y <= 6; y++) {
      for (let x = -6; x <= 6; x++) {
        if (createInfiniteCell(game, x, y).isHibol) {
          any = true
        }
      }
    }
    expect(any).toBe(false)
  })

  it("reveal : banque le hibol immédiatement (hibolsCollectedCount++)", () => {
    const game = createTreasureGame(11)
    const hibol = findCell(game, 200, (c) => c.isHibol)
    expect(hibol, "aucun hibol matérialisé dans la région scannée").toBeTruthy()

    getCell(game, hibol.x + 1, hibol.y).revealed = true
    expect(game.hibolsCollectedCount).toBe(0)

    revealCell(game, getCell(game, hibol.x, hibol.y))

    expect(game.hibolsCollectedCount).toBe(1)
  })

  it("restauration : recompte hibolsCollectedCount depuis les cases touchées, pas depuis un champ dupliqué du snapshot", () => {
    const game = createTreasureGame(11)
    const hibolCoords = []

    for (let y = -260; y <= 260 && hibolCoords.length < 2; y += 2) {
      for (let x = -260; x <= 260 && hibolCoords.length < 2; x += 2) {
        if (createInfiniteCell(game, x, y).isHibol) {
          hibolCoords.push({ x, y })
        }
      }
    }
    expect(hibolCoords.length, "besoin de 2 hibols pour ce test").toBe(2)

    const snapshot = {
      seed: game.seed,
      unlimitedLives: false,
      status: "playing",
      tornadoCount: 0,
      chestFound: false,
      revealedCount: 2,
      flaggedCount: 0,
      minesTriggeredCount: 0,
      maxDistance: 10,
      // Le snapshot ne porte plus hibolsCollectedCount : un seul révélé, un
      // second seulement flaggé (touché mais jamais révélé) — ne doit pas
      // compter.
      cells: [
        { ...hibolCoords[0], revealed: true, flagged: false },
        { ...hibolCoords[1], revealed: false, flagged: true },
      ],
    }

    const restored = restoreTreasureGame(snapshot)

    expect(restored.hibolsCollectedCount).toBe(1)
  })

  it("l'exclusion mine/coffre/tornade tient aussi après une relocalisation du coffre (tornadoCount > 0)", () => {
    const game = createTreasureGame(7)
    game.tornadoCount = 1
    game.chest = chestPositionFor(game.seed, 1)

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cell = createInfiniteCell(
          game,
          game.chest.x + dx,
          game.chest.y + dy,
        )
        expect(cell.isHibol).toBe(false)
      }
    }
  })
})
