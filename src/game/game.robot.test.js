import { describe, it, expect } from "vitest"
import {
  createInfiniteGame,
  restoreInfiniteGame,
  revealCell,
  getCell,
  getNeighbors,
  advanceRobotWalks,
  finishRobotWalks,
  nextRobotWalk,
  stepRobotWalk,
  ROBOT_MAX_STEPS,
  ROBOT_STEP_MS,
  ROBOT_TRAVEL_MS,
} from "./game.js"
import {
  isTouchedCell,
  touchedCellSnapshot,
  robotWalksSnapshot,
} from "../state/gameStorage.js"

// Révéler une case isRobot démarre une marche (game.robotWalks) sans rien
// jouer ; chaque pas se joue ensuite avec advanceRobotWalks / stepRobotWalk.
//
// La marche TIRE AU SORT la case suivante parmi ses candidates. Les « pièces »
// construites à la main (bordure `revealed`, intérieur caché) ne laissent
// qu'UNE candidate par pas → trajet déterministe malgré le RNG. Les scénarios
// sur parties seedées, eux, comparent deux exécutions ou des valeurs figées.

function baseCell(x, y, props) {
  return {
    x,
    y,
    isMine: false,
    isHeart: false,
    isRobot: false,
    isTornado: false,
    revealed: false,
    flagged: false,
    wrong: false,
    neighborMines: 0,
    tiltDeg: 0,
    robotHere: false,
    ...props,
  }
}

function emptyGame(seed) {
  const game = createInfiniteGame(seed)
  game.cells.clear()
  Object.assign(game, {
    revealedCount: 0,
    flaggedCount: 0,
    minesTriggeredCount: 0,
    heartsCollectedCount: 0,
    robotsTriggeredCount: 0,
    maxDistance: 0,
    robotWalks: [],
    robotClock: 0,
    pendingRobotTrails: [],
    pendingHeartReveals: [],
    robotWalkInProgress: false,
    openingInProgress: false,
  })
  return game
}

// Rectangle intérieur [x0..x1] x [y0..y1], ceinturé d'un anneau `revealed`
// (jamais candidat, jamais re-matérialisé). `overrides` : { "x,y": props }.
function room(x0, y0, x1, y1, overrides = {}, seed = 1) {
  const game = emptyGame(seed)
  for (let y = y0 - 1; y <= y1 + 1; y++) {
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      const border = x < x0 || x > x1 || y < y0 || y > y1
      game.cells.set(
        `${x},${y}`,
        baseCell(x, y, border ? { revealed: true } : {}),
      )
    }
  }
  for (const [key, props] of Object.entries(overrides)) {
    Object.assign(game.cells.get(key), props)
  }
  return game
}

// Tous les pas d'un coup, en gardant la trace : [{ id, kind, at, changed }].
function playAll(game) {
  const events = []
  let event
  while ((event = advanceRobotWalks(game))) {
    events.push(event)
  }
  return events
}

const keyOf = (cell) => `${cell.x},${cell.y}`
const discoveries = (events) => events.filter((e) => e.kind === "discover")
const revealedKeys = (game) =>
  [...game.cells.values()]
    .filter((c) => c.revealed)
    .map(keyOf)
    .sort()

// Snapshot tel que l'écrit saveActiveGame (cf. game.restore.test.js).
function snapshotOf(game) {
  return {
    mode: "infinite",
    seed: game.seed,
    baseDensity: game.baseDensity,
    heartDensityScale: game.heartDensityScale,
    heartMinDensity: game.heartMinDensity,
    densityScale: game.densityScale,
    darknessMineThreshold: game.darknessMineThreshold,
    robotDensityScale: game.robotDensityScale,
    robotMinDensity: game.robotMinDensity,
    status: game.status,
    revealedCount: game.revealedCount,
    flaggedCount: game.flaggedCount,
    minesTriggeredCount: game.minesTriggeredCount,
    heartsCollectedCount: game.heartsCollectedCount,
    robotsTriggeredCount: game.robotsTriggeredCount,
    usedMachines: game.usedMachines,
    maxDistance: game.maxDistance,
    safeZones: game.safeZones,
    forcedSafeCells: game.forcedSafeCells,
    ...robotWalksSnapshot(game),
    cells: [...game.cells.values()]
      .filter(isTouchedCell)
      .map(touchedCellSnapshot),
  }
}

// Partie seedée + robot posé à la main sur la 1re case cachée numérotée du bord
// de l'ouverture (ordre y puis x) : un clic direct, sans cascade.
function seededRobotGame(seed) {
  const game = createInfiniteGame(seed)
  const robot = [...game.cells.values()]
    .filter(
      (c) =>
        !c.revealed &&
        !c.isMine &&
        c.neighborMines > 0 &&
        getNeighbors(game, c).some((n) => n.revealed),
    )
    .sort((a, b) => a.y - b.y || a.x - b.x)[0]
  robot.isRobot = true
  return { game, robot }
}

function fnv(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16)
}

describe("robot — déclenchement", () => {
  it("révéler une case isRobot démarre une marche sans jouer aucun pas", () => {
    const game = room(0, 0, 2, 0, {
      "0,0": { isRobot: true, neighborMines: 1 },
      "1,0": { neighborMines: 1 },
      "2,0": { neighborMines: 1 },
    })

    revealCell(game, game.cells.get("0,0"))

    expect(game.robotsTriggeredCount).toBe(1)
    expect(game.robotWalks).toHaveLength(1)
    expect(game.pendingRobotTrails).toEqual([
      { id: game.robotWalks[0].id, x: 0, y: 0 },
    ])
    expect(game.cells.get("0,0").robotHere).toBe(true)
    expect(game.cells.get("1,0").revealed).toBe(false) // rien d'avance
    expect(game.revealedCount).toBe(1)
    expect(nextRobotWalk(game).dueAt).toBe(ROBOT_STEP_MS)
  })

  it("robot numéroté encerclé : le premier pas termine la marche et retire le sprite", () => {
    const game = room(0, 0, 0, 0, {
      "0,0": { isRobot: true, neighborMines: 1 },
    })
    revealCell(game, game.cells.get("0,0"))

    const events = playAll(game)

    expect(events.map((e) => e.kind)).toEqual(["end"])
    expect(game.cells.get("0,0").robotHere).toBe(false)
    expect(game.robotWalks).toEqual([])
    expect(game.robotClock).toBe(0)
  })
})

describe("robot — un pas = un clic", () => {
  it("chaque pas de découverte d'une marche réelle donne l'état d'un clic sur la même case", () => {
    // Graine 99 : cascades et traversées de poche (cf. valeurs figées plus bas).
    const { game, robot } = seededRobotGame(99)
    revealCell(game, robot)
    let compared = 0

    for (;;) {
      // Clone sans marche (rien à terminer), avant le pas.
      const clone = restoreInfiniteGame({
        ...snapshotOf(game),
        robotWalks: [],
      })
      const event = advanceRobotWalks(game)
      if (!event) break
      if (event.kind !== "discover" || event.at.isMine) continue

      revealCell(clone, getCell(clone, event.at.x, event.at.y))
      expect(revealedKeys(game)).toEqual(revealedKeys(clone))
      expect(game.revealedCount).toBe(clone.revealedCount)
      expect(game.heartsCollectedCount).toBe(clone.heartsCollectedCount)
      expect(game.maxDistance).toBe(clone.maxDistance)
      compared++
    }

    expect(compared).toBeGreaterThan(3)
  })

  it("un cœur sur le chemin n'est révélé et compté qu'au pas qui l'atteint", () => {
    const game = room(0, 0, 3, 0, {
      "0,0": { isRobot: true, neighborMines: 1 },
      "1,0": { neighborMines: 1 },
      "2,0": { neighborMines: 1, isHeart: true },
      "3,0": { neighborMines: 1 },
    })
    revealCell(game, game.cells.get("0,0"))
    const heart = game.cells.get("2,0")

    advanceRobotWalks(game) // arrive en (1,0)
    expect(heart.revealed).toBe(false)
    expect(game.heartsCollectedCount).toBe(0)
    expect(game.pendingHeartReveals).toEqual([])

    const event = advanceRobotWalks(game) // arrive sur le cœur
    expect(event.at).toBe(heart)
    expect(heart.revealed).toBe(true)
    expect(game.heartsCollectedCount).toBe(1)
    expect(game.pendingHeartReveals).toEqual([heart])
    expect(game.revealedCount).toBe(3)
  })
})

describe("robot — fins de marche", () => {
  it("au plus ROBOT_MAX_STEPS pas de découverte (couloir plus long que la marche)", () => {
    // Couloir est de 12 cases, toutes numérotées → pas de cascade, une seule
    // candidate par pas.
    const overrides = { "0,0": { isRobot: true, neighborMines: 1 } }
    for (let x = 1; x <= 12; x++) overrides[`${x},0`] = { neighborMines: 1 }
    const game = room(0, 0, 12, 0, overrides)
    revealCell(game, game.cells.get("0,0"))

    const events = playAll(game)

    expect(discoveries(events).map((e) => e.at.x)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ])
    expect(discoveries(events)).toHaveLength(ROBOT_MAX_STEPS)
    expect(events.at(-1).kind).toBe("end")
    expect(game.cells.get("11,0").revealed).toBe(false)
  })

  it("s’arrête sur une mine : elle devient `revealed` mais NE compte pas (neutre)", () => {
    const game = room(0, 0, 1, 0, {
      "0,0": { isRobot: true, neighborMines: 1 },
      "1,0": { isMine: true, neighborMines: 0 },
    })
    revealCell(game, game.cells.get("0,0"))

    const events = playAll(game)

    expect(events.map((e) => e.kind)).toEqual(["discover", "end"])
    expect(events[0].at).toBe(game.cells.get("1,0"))
    expect(events[0].changed).toEqual([
      game.cells.get("0,0"),
      game.cells.get("1,0"),
    ])
    expect(game.cells.get("1,0").revealed).toBe(true)
    expect(game.minesTriggeredCount).toBe(0) // neutre : pas un clic joueur
    expect(game.cells.get("1,0").wrong).toBe(false)
  })

  it("évite les mines pendant les premiers pas s’il a le choix", () => {
    // (1,0) minée, (0,1) sûre : sur 50 graines, jamais la mine au 1er pas.
    for (let seed = 1; seed <= 50; seed++) {
      const game = room(
        0,
        0,
        1,
        1,
        {
          "0,0": { isRobot: true, neighborMines: 1 },
          "1,0": { isMine: true },
          "1,1": { revealed: true },
          "0,1": { neighborMines: 1 },
        },
        seed,
      )
      revealCell(game, game.cells.get("0,0"))
      expect(advanceRobotWalks(game).at).toBe(game.cells.get("0,1"))
    }
  })
})

describe("robot — un robot révélé PENDANT une marche ne relance pas la sienne", () => {
  it("robotsTriggeredCount reste à 1", () => {
    const overrides = {
      "0,0": { isRobot: true, neighborMines: 1 },
      "3,0": { isRobot: true, neighborMines: 1 }, // sur le trajet
    }
    for (let x = 1; x <= 12; x++)
      overrides[`${x},0`] = { ...(overrides[`${x},0`] ?? {}), neighborMines: 1 }
    const game = room(0, 0, 12, 0, overrides)
    revealCell(game, game.cells.get("0,0"))

    playAll(game)

    expect(game.robotsTriggeredCount).toBe(1)
    expect(game.pendingRobotTrails).toHaveLength(1)
    expect(game.cells.get("3,0").revealed).toBe(true) // bien foulé, juste sans nouvelle marche
    expect(game.robotWalkInProgress).toBe(false)
  })
})

describe("robot — traversée d’une poche qu’il vient d’ouvrir", () => {
  // Intérieur surtout à 0 voisin (cascade), avec une "grille" de cases
  // numérotées en x=5 : la cascade s'y arrête, les cases x>5 restent cachées
  // → le robot doit marcher jusqu'au bord (5,·) puis repartir.
  function pocketRoom() {
    return room(0, 0, 10, 2, {
      "0,0": { isRobot: true, neighborMines: 1 },
      "0,1": { revealed: true },
      "1,1": { revealed: true },
      "5,0": { neighborMines: 1 },
      "5,1": { neighborMines: 1 },
      "5,2": { neighborMines: 1 },
    })
  }

  it("rejoint le bord case par case sans rien révéler, puis repart de là", () => {
    const game = pocketRoom()
    revealCell(game, game.cells.get("0,0"))

    const first = advanceRobotWalks(game)
    expect(first.kind).toBe("discover")
    expect(first.changed.length).toBeGreaterThanOrEqual(5) // la poche ouverte

    const walk = game.robotWalks[0]
    const revealedBefore = revealedKeys(game)
    const countBefore = game.revealedCount
    const stepBefore = walk.step
    let previous = first.at
    let event

    while ((event = advanceRobotWalks(game)).kind === "travel") {
      // Une case voisine déjà révélée, rien de neuf, pas compté.
      expect(Math.abs(event.at.x - previous.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(event.at.y - previous.y)).toBeLessThanOrEqual(1)
      expect(event.changed).toEqual([previous, event.at])
      expect(previous.robotHere).toBe(false)
      expect(event.at.robotHere).toBe(true)
      expect(revealedKeys(game)).toEqual(revealedBefore)
      expect(game.revealedCount).toBe(countBefore)
      expect(walk.step).toBe(stepBefore)
      previous = event.at
    }

    // Arrivé sur le bord (la colonne numérotée), il découvre une case cachée.
    expect(previous.x).toBe(5)
    expect(event.kind).toBe("discover")
    expect(revealedBefore).not.toContain(keyOf(event.at))
    expect(Math.abs(event.at.x - previous.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(event.at.y - previous.y)).toBeLessThanOrEqual(1)
  })

  it("robot sur une case à 0 : encerclé par la cascade du clic, il part du bord de cette poche", () => {
    const game = room(0, 0, 10, 2, {
      "0,0": { isRobot: true },
      "5,0": { neighborMines: 1 },
      "5,1": { neighborMines: 1 },
      "5,2": { neighborMines: 1 },
    })
    // Anneau de drapeaux autour de la bordure : elle n'a plus de voisin caché,
    // seule la colonne x=5 reste un bord de poche.
    for (let y = -2; y <= 4; y++) {
      for (let x = -2; x <= 12; x++) {
        if (x === -2 || x === 12 || y === -2 || y === 4) {
          game.cells.set(`${x},${y}`, baseCell(x, y, { flagged: true }))
        }
      }
    }
    revealCell(game, game.cells.get("0,0"))
    expect(game.cells.get("5,1").revealed).toBe(true) // poche du clic ouverte
    const countAfterClick = game.revealedCount

    const events = playAll(game)
    const firstDiscovery = events.findIndex((e) => e.kind === "discover")
    const travel = events.slice(0, firstDiscovery)

    expect(travel.map((e) => e.kind)).toEqual(Array(5).fill("travel"))
    expect(keyOf(travel.at(-1).at)).toBe("5,0") // bord le plus proche
    expect(events[firstDiscovery].at.x).toBe(6)
    expect(game.revealedCount).toBeGreaterThan(countAfterClick)
  })

  it("rythme : déplacements à ROBOT_TRAVEL_MS, découverte à ROBOT_STEP_MS", () => {
    const game = pocketRoom()
    revealCell(game, game.cells.get("0,0"))
    const times = []
    let event
    do {
      const walk = nextRobotWalk(game)
      times.push(walk.dueAt)
      event = stepRobotWalk(game, walk)
    } while (event.kind !== "discover" || times.length === 1)

    const gaps = times.slice(1).map((t, i) => t - times[i])
    expect(times[0]).toBe(ROBOT_STEP_MS)
    expect(gaps.slice(1, -1).every((g) => g === ROBOT_TRAVEL_MS)).toBe(true)
    expect(gaps.at(-1)).toBe(ROBOT_STEP_MS) // pause avant de découvrir
  })
})

describe("robot — tirage seedé (déterministe, pas de Math.random)", () => {
  // Bande 5×3, origine au milieu du bord haut (3 voisins déjà `revealed`
  // au-dessus, 5 candidates cachées) : le générateur compte vraiment.
  function candidateRoom(seed, ox, oy) {
    const overrides = { [`${ox},${oy}`]: { isRobot: true, neighborMines: 1 } }
    for (let y = oy; y <= oy + 2; y++) {
      for (let x = ox - 2; x <= ox + 2; x++) {
        overrides[`${x},${y}`] ??= { neighborMines: 1 }
      }
    }
    return room(ox - 2, oy, ox + 2, oy + 2, overrides, seed)
  }

  function leads(game, key) {
    revealCell(game, game.cells.get(key))
    return discoveries(playAll(game)).map((e) => keyOf(e.at))
  }

  it("même seed + même origine de robot ⇒ même trajet, à l'identique sur deux appels indépendants", () => {
    const stepsA = leads(candidateRoom(99, 2, 2), "2,2")
    const stepsB = leads(candidateRoom(99, 2, 2), "2,2")

    expect(stepsA.length).toBeGreaterThan(1) // sinon le test ne prouve rien
    expect(stepsB).toEqual(stepsA)
  })

  it("deux origines différentes (même seed) ne choisissent pas systématiquement la même direction relative", () => {
    const [leadA] = leads(candidateRoom(1, 0, 0), "0,0")
    const [leadB] = leads(candidateRoom(1, 5, 5), "5,5")
    const [ax, ay] = leadA.split(",").map(Number)
    const [bx, by] = leadB.split(",").map(Number)

    expect(`${bx - 5},${by - 5}`).not.toBe(`${ax},${ay}`)
  })
})

describe("robot — même résultat qu’avant la marche pas à pas (un seul robot)", () => {
  // Figé avec l'ancien moteur (marche résolue d'un bloc au déclenchement) : un
  // robot cliqué directement, tous les pas joués d'un coup. Les graines 99 et
  // 123 en sont absentes : un repositionnement y tombait sur une égalité de
  // distance, départagée avant par l'ordre de game.cells, désormais par y/x.
  const GOLDEN = [
    { seed: 1, robot: "-4,-3", steps: 10, revealedCount: 55, hash: "c41dc70f" },
    { seed: 3, robot: "-4,-9", steps: 6, revealedCount: 92, hash: "c3edb821" },
    { seed: 4, robot: "1,-6", steps: 5, revealedCount: 51, hash: "396b3cb3" },
    { seed: 5, robot: "-3,-4", steps: 6, revealedCount: 24, hash: "dc5a53b1" },
    { seed: 10, robot: "-3,-7", steps: 7, revealedCount: 55, hash: "46aac90c" },
    { seed: 42, robot: "-1,-2", steps: 5, revealedCount: 26, hash: "dcbbc4eb" },
    {
      seed: 777,
      robot: "-3,-3",
      steps: 5,
      revealedCount: 34,
      hash: "da38d344",
    },
  ]

  for (const expected of GOLDEN) {
    it(`graine ${expected.seed}`, () => {
      const { game, robot } = seededRobotGame(expected.seed)
      expect(keyOf(robot)).toBe(expected.robot)

      revealCell(game, robot)
      const events = playAll(game)

      expect(discoveries(events)).toHaveLength(expected.steps)
      expect(game.revealedCount).toBe(expected.revealedCount)
      expect(fnv(revealedKeys(game).join(";"))).toBe(expected.hash)
      expect([...game.cells.values()].some((c) => c.robotHere)).toBe(false)
    })
  }
})

describe("robot — plusieurs robots d’une même cascade", () => {
  // Graine 3 : le clic en (1,5) ouvre une poche dont (2,4) et (4,8) sont des
  // cases numérotées, transformées ici en robots.
  function twoRobots() {
    const game = createInfiniteGame(3)
    getCell(game, 2, 4).isRobot = true
    getCell(game, 4, 8).isRobot = true
    revealCell(game, getCell(game, 1, 5))
    return game
  }

  const trace = (events) =>
    events.map((e) => `${e.id}:${e.kind}:${e.at ? keyOf(e.at) : "-"}`)

  it("leurs pas s’entrelacent sur l’horloge virtuelle", () => {
    const game = twoRobots()
    expect(game.robotsTriggeredCount).toBe(2)
    expect(game.robotWalks).toHaveLength(2)

    const ids = playAll(game).map((e) => e.id)
    const [a, b] = game.pendingRobotTrails.map((t) => t.id)
    expect(ids.slice(0, 4)).toEqual([a, b, a, b])
  })

  it("même séquence de clics ⇒ mêmes pas, même état final", () => {
    const first = twoRobots()
    const second = twoRobots()

    expect(trace(playAll(second))).toEqual(trace(playAll(first)))
    expect(revealedKeys(second)).toEqual(revealedKeys(first))
    expect(second.revealedCount).toBe(first.revealedCount)
  })
})

describe("robot — sauvegarde et restauration", () => {
  it("une marche interrompue se termine à la restauration, comme si elle avait été jouée", () => {
    const { game, robot } = seededRobotGame(99)
    revealCell(game, robot)
    advanceRobotWalks(game)
    advanceRobotWalks(game)
    advanceRobotWalks(game)

    const snapshot = JSON.parse(JSON.stringify(snapshotOf(game)))
    expect(snapshot.robotWalks).toHaveLength(1)

    const restored = restoreInfiniteGame(snapshot)
    finishRobotWalks(game)

    expect(restored.robotWalks).toEqual([])
    expect(restored.pendingRobotTrails).toEqual([])
    expect(revealedKeys(restored)).toEqual(revealedKeys(game))
    expect(restored.revealedCount).toBe(game.revealedCount)
    expect(restored.maxDistance).toBe(game.maxDistance)
    expect([...restored.cells.values()].some((c) => c.robotHere)).toBe(false)
  })

  it("deux robots interrompus se terminent dans le même ordre qu’à l’écran", () => {
    const game = createInfiniteGame(3)
    getCell(game, 2, 4).isRobot = true
    getCell(game, 4, 8).isRobot = true
    revealCell(game, getCell(game, 1, 5))
    for (let i = 0; i < 5; i++) advanceRobotWalks(game)

    const restored = restoreInfiniteGame(
      JSON.parse(JSON.stringify(snapshotOf(game))),
    )
    finishRobotWalks(game)

    expect(revealedKeys(restored)).toEqual(revealedKeys(game))
  })
})
