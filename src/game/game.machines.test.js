import { describe, it, expect } from "vitest"
import {
  createInfiniteGame,
  createTreasureGame,
  getCell,
  getDarkness,
  useWindMachine,
  useXrayMachine,
  useTravelMachine,
  hasDeducibleFrontier,
  solveVirtualFrontier,
  wouldLandingBeDeducible,
  XRAY_RADIUS,
  TRAVEL_MIN_CLEARANCE,
} from "./game.js"

// Les 3 consommables du shop (Infini uniquement). Déterministes : ils lisent
// le même plateau haché. Aucun mock.

describe("machines — useWindMachine", () => {
  it("remonte heartsCollectedCount à hauteur des mines, darkness → 0, mines inchangées", () => {
    const game = createInfiniteGame(1)
    game.minesTriggeredCount = 6
    game.heartsCollectedCount = 2

    useWindMachine(game)

    expect(game.heartsCollectedCount).toBe(6)
    expect(game.minesTriggeredCount).toBe(6)
    expect(getDarkness(game)).toBe(0)
  })

  it("ne baisse jamais heartsCollectedCount s’il dépasse déjà les mines", () => {
    const game = createInfiniteGame(1)
    game.minesTriggeredCount = 3
    game.heartsCollectedCount = 10

    useWindMachine(game)

    expect(game.heartsCollectedCount).toBe(10)
  })

  it("no-op hors mode infini", () => {
    const game = createTreasureGame(1)
    game.minesTriggeredCount = 5
    game.heartsCollectedCount = 0

    useWindMachine(game)

    expect(game.heartsCollectedCount).toBe(0)
  })

  it("crédite confirmedHeartsCount (override App.vue) via un delta, pas via game.heartsCollectedCount", () => {
    const game = createInfiniteGame(1)
    game.minesTriggeredCount = 6
    // confirmedHeartsCount (cœurs réellement VUS, cf. useHeartFogReveal.js)
    // peut rester bien en dessous du compteur brut si des cœurs ont été
    // révélés hors champ — c'est cette valeur, pas game.heartsCollectedCount,
    // que le voile réellement affiché utilise.
    const confirmedHeartsCount = 2

    const delta = useWindMachine(game, confirmedHeartsCount)

    expect(delta).toBe(4) // 6 mines - 2 cœurs vus
    expect(game.heartFogWindCredit).toBe(4)
    // C'est à l'appelant (useMachines.js) de reporter delta sur son propre
    // ref confirmedHeartsCount — cf. le test dédié dans ce fichier.
    expect(getDarkness(game, confirmedHeartsCount + delta)).toBe(0)
  })

  it("le delta ne crée pas de zone morte : le cœur suivant compte tout de suite (pas un plancher relu à chaque calcul)", () => {
    const game = createInfiniteGame(1)
    game.minesTriggeredCount = 69
    let confirmedHeartsCount = 61

    const delta = useWindMachine(game, confirmedHeartsCount)
    confirmedHeartsCount += delta // même report que useMachines.js
    expect(getDarkness(game, confirmedHeartsCount)).toBe(0)

    // Une mine de plus (voile qui remonte), puis un cœur trouvé ET vu tout de
    // suite après doit ALLÉGER le voile sans attendre que confirmedHeartsCount
    // ait organiquement dépassé 69 — c'était le bug de la 1re version de ce
    // fix (plancher via Math.max() relu à chaque frame).
    game.minesTriggeredCount = 70
    confirmedHeartsCount += 1
    expect(getEffectiveMinesFor(game, confirmedHeartsCount)).toBe(0)
  })
})

// Même calcul que getEffectiveMines (non exporté) : mines nettes après le
// delta Wind Machine déjà reporté sur confirmedHeartsCount par l'appelant.
function getEffectiveMinesFor(game, confirmedHeartsCount) {
  return Math.max(0, game.minesTriggeredCount - confirmedHeartsCount)
}

describe("machines — useXrayMachine", () => {
  // Un disque loin de la poche d'ouverture pour ne pas mélanger avec les cases
  // révélées au lancement.
  const CX = 200
  const CY = 0

  it("ne révèle QUE des mines, sans les compteurs de dégât, et renvoie leur nombre", () => {
    const game = createInfiniteGame(1)
    const before = game.minesTriggeredCount

    const revealed = useXrayMachine(game, CX, CY)
    expect(revealed).toBeGreaterThan(0) // densité ~0.25 à cette distance

    let minesInDisk = 0
    for (const cell of game.cells.values()) {
      const inDisk =
        (cell.x - CX) ** 2 + (cell.y - CY) ** 2 <= XRAY_RADIUS * XRAY_RADIUS
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

  it("ne matérialise pas les cases sûres du disque", () => {
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

  it("no-op hors mode infini (renvoie 0)", () => {
    const treasure = createTreasureGame(1)
    expect(useXrayMachine(treasure, 0, 0)).toBe(0)
  })
})

describe("machines — useTravelMachine", () => {
  it("atterrit à ≥ TRAVEL_MIN_CLEARANCE de toute case déjà révélée, plante une safeZone et ouvre une cascade", () => {
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

  it("avance tant que le point d’arrivée retombe dans la zone révélée (boucle interne)", () => {
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
    expect(Math.hypot(arrival.x - from.x, arrival.y - from.y)).toBeGreaterThan(
      TRAVEL_MIN_CLEARANCE,
    )
  })

  it("renvoie null si la partie n’est pas en cours", () => {
    const game = createInfiniteGame(1)
    game.status = "lost"
    expect(useTravelMachine(game, 0, 0, 0)).toBeNull()
  })

  it("renvoie null hors mode infini", () => {
    const treasure = createTreasureGame(1)
    expect(useTravelMachine(treasure, 0, 0, 0)).toBeNull()
  })

  // seed 1, direction +x depuis (38, 0) : le tout premier candidat (à
  // TRAVEL_MIN_CLEARANCE, soit (53, 0)) simule une poche sans aucune
  // déduction possible ; le suivant ((55, 0)) en a une. Trouvé par recherche
  // manuelle (cf. session) plutôt que déduit — figé ici en dur pour ne pas
  // dépendre d'une recherche de seed fragile à l'exécution des tests.
  it("saute un point d'arrivée dont la poche ne serait pas déductible, sans laisser de trace", () => {
    const game = createInfiniteGame(1)
    const cellsSizeBefore = game.cells.size

    expect(wouldLandingBeDeducible(game, 53, 0)).toBe(false)
    expect(wouldLandingBeDeducible(game, 55, 0)).toBe(true)
    // Les deux vérifications ci-dessus ne doivent rien avoir laissé derrière
    // elles (candidats simulés, jamais commités).
    expect(game.safeZones.length).toBe(0)
    expect(game.cells.size).toBe(cellsSizeBefore)

    const arrival = useTravelMachine(game, 38, 0, 0)

    expect(arrival).toEqual({ x: 55, y: 0 })
    expect(game.safeZones).toEqual([{ x: 55, y: 0 }]) // le candidat (53,0) rejeté n'a rien laissé
    expect(hasDeducibleFrontier(game)).toBe(true)
  })

  it("wouldLandingBeDeducible ne modifie jamais game.safeZones ni game.cells, accepté ou rejeté", () => {
    const game = createInfiniteGame(1)
    const safeZonesBefore = [...game.safeZones]
    const cellsSizeBefore = game.cells.size

    wouldLandingBeDeducible(game, 53, 0) // rejeté (cf. test ci-dessus)
    wouldLandingBeDeducible(game, 55, 0) // accepté

    expect(game.safeZones).toEqual(safeZonesBefore)
    expect(game.cells.size).toBe(cellsSizeBefore)
    expect(game.cells.has("53,0")).toBe(false)
    expect(game.cells.has("55,0")).toBe(false)
  })

  // Toute case a pu être matérialisée par getCell AVANT que la safeZone
  // n'existe (survol caméra, jostle de mine, X-Ray, un atterrissage
  // antérieur dont le bloc chevauche celui-ci...) — getCell ne recalcule
  // jamais un cache existant. Reproduit ici en pré-matérialisant (53,0) comme
  // mine (son vrai isMine hors safeZone, seed 1) : l'atterrissage accepté est
  // (55,0) — cf. test précédent, (53,0) reste non déductible — dont le bloc
  // 5x5 englobe (53,0) (distance 2). Sans le correctif, la cascade depuis
  // (55,0) balaie (53,0) et minesTriggeredCount passerait à 1 malgré la
  // safeZone qui vient de l'englober.
  it("régénère toute case du bloc déjà matérialisée AVANT la safeZone (mine restée en cache)", () => {
    const game = createInfiniteGame(1)
    const staleMine = { x: 53, y: 0 }

    expect(getCell(game, staleMine.x, staleMine.y).isMine).toBe(true) // vrai hors safeZone

    const arrival = useTravelMachine(game, 38, 0, 0)

    expect(arrival).toEqual({ x: 55, y: 0 })
    expect(game.status).toBe("playing")
    expect(game.minesTriggeredCount).toBe(0)
    expect(getCell(game, staleMine.x, staleMine.y).isMine).toBe(false)
    expect(getCell(game, staleMine.x, staleMine.y).revealed).toBe(true)
  })
})

// Même algorithme que solveFrontier (hasDeducibleFrontier), mais sur des clés
// de coordonnées plutôt que des objets case — testé en isolation de la même
// façon que hasDeducibleFrontier via miniGame (cf. game.solvability.test.js),
// sans avoir besoin d'un `game` ni d'une génération.
describe("solveVirtualFrontier — logique du solveur (isolée)", () => {
  function keyMap(keys) {
    return new Map(keys.map((k) => [k, true]))
  }

  it('ne déduit rien sur une contrainte "1 parmi 2 inconnues" sans rien d’autre pour trancher', () => {
    const frontier = [{ x: 0, y: 0, neighborMines: 1 }]
    // Seule "0,0" est révélée : les 8 voisines (dont (1,0) et (-1,0)) sont
    // toutes inconnues.
    const { safe, mines } = solveVirtualFrontier(frontier, keyMap(["0,0"]))

    expect(safe.size).toBe(0)
    expect(mines.size).toBe(0)
  })

  it("déduit sûres toutes les voisines quand neighborMines vaut 0", () => {
    const frontier = [{ x: 0, y: 0, neighborMines: 0 }]
    const { safe, mines } = solveVirtualFrontier(frontier, keyMap(["0,0"]))

    expect(safe.size).toBe(8) // les 8 voisines de (0,0)
    expect(mines.size).toBe(0)
  })

  it("déduit minée la seule voisine encore inconnue quand elle égale neighborMines restant", () => {
    // (0,0) a neighborMines=1. On révèle 7 de ses 8 voisines (donc "connues,
    // non minées"), ne laissant que (1,0) inconnue → forcément la mine.
    const revealedKeys = [
      "0,0",
      "-1,-1",
      "0,-1",
      "1,-1",
      "-1,0",
      "-1,1",
      "0,1",
      "1,1",
    ]
    const frontier = [{ x: 0, y: 0, neighborMines: 1 }]
    const { safe, mines } = solveVirtualFrontier(frontier, keyMap(revealedKeys))

    expect(mines.has("1,0")).toBe(true)
    expect(safe.size).toBe(0)
  })
})
